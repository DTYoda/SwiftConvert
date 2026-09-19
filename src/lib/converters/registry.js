/**
 * Converter registry — routes by source/target MIME family.
 * Lightweight paths (canvas image, image→PDF) run in-page.
 * HEIC / PDF→image / DOCX require the convert host (libs loaded there).
 */
(function (root) {
  const Mime = root.SwiftConvertMime;
  const Image = root.SwiftConvertImage;
  const PdfWrite = root.SwiftConvertPdfWrite;
  const Heic = root.SwiftConvertHeic;
  const Pdf = root.SwiftConvertPdf;
  const Docx = root.SwiftConvertDocx;

  function sourceMime(file) {
    return Mime.mimeFromFile(file);
  }

  function needsHost(file, targetMime) {
    const target = Mime.normalizeMime(targetMime);
    const src = sourceMime(file);
    if (Heic && Heic.isHeicFile && Heic.isHeicFile(file)) return true;
    if (Pdf && Pdf.isPdfFile && Pdf.isPdfFile(file) && target.startsWith("image/")) return true;
    if (Docx && Docx.isDocxFile && Docx.isDocxFile(file)) return true;
    // HEIC by mime when helpers not loaded yet
    if (src === "image/heic" || src === "image/heif") return true;
    if (src === "application/pdf" && target.startsWith("image/")) return true;
    if (
      src === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      src === "application/msword"
    ) {
      return true;
    }
    return false;
  }

  async function convertFile(file, targetMime) {
    const target = Mime.normalizeMime(targetMime);
    if (!target) return file;
    const src = sourceMime(file);

    // HEIC path (host)
    if (Heic && Heic.canConvert && Heic.canConvert(file, target)) {
      return Heic.convert(file, target);
    }

    // PDF → image (host)
    if (Pdf && Pdf.canConvert && Pdf.canConvert(file, target)) {
      return Pdf.convert(file, target);
    }

    // DOCX (host)
    if (Docx && Docx.canConvert && Docx.canConvert(file, target)) {
      return Docx.convert(file, target);
    }

    // Image → PDF (in-page)
    if (
      target === "application/pdf" &&
      src.startsWith("image/") &&
      src !== "image/svg+xml" &&
      PdfWrite &&
      PdfWrite.imageFileToPdf
    ) {
      return PdfWrite.imageFileToPdf(file);
    }

    // Canvas raster images
    if (Image && Image.canConvert(file, target)) {
      return Image.convertImage(file, target);
    }

    if (src.startsWith("image/") && target.startsWith("image/") && Image) {
      return Image.convertImage(file, target);
    }

    throw new Error(`No converter for ${src || "unknown"} → ${target}`);
  }

  function canHandle(file, targetMime) {
    const target = Mime.normalizeMime(targetMime);
    if (!target) return false;
    if (Heic && Heic.canConvert && Heic.canConvert(file, target)) return true;
    if (Pdf && Pdf.canConvert && Pdf.canConvert(file, target)) return true;
    if (Docx && Docx.canConvert && Docx.canConvert(file, target)) return true;

    const src = sourceMime(file);
    // Host paths advertised even when libs aren't in this world yet
    if (src === "image/heic" || src === "image/heif") {
      return (
        target === "image/jpeg" ||
        target === "image/png" ||
        target === "image/webp" ||
        target === "image/gif"
      );
    }
    if (src === "application/pdf" && target.startsWith("image/")) return true;
    if (
      src === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      src === "application/msword"
    ) {
      return (
        target === "text/plain" ||
        target === "text/html" ||
        target === "application/pdf"
      );
    }
    if (target === "application/pdf" && src.startsWith("image/") && src !== "image/svg+xml") {
      return true;
    }
    if (Image && Image.canConvert(file, target)) return true;
    return src.startsWith("image/") && target.startsWith("image/");
  }

  root.SwiftConvertRegistry = { convertFile, canHandle, needsHost };
})(typeof globalThis !== "undefined" ? globalThis : self);
