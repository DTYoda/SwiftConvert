/**
 * Converter registry — edge catalog + shortest-path chaining.
 * Lightweight paths (canvas image, image→PDF) run in-page.
 * HEIC / PDF / DOCX / office / ffmpeg require the convert host.
 */
(function (root) {
  const Mime = root.SwiftConvertMime;
  const Catalog = root.SwiftConvertCatalog;
  const Image = root.SwiftConvertImage;
  const PdfWrite = root.SwiftConvertPdfWrite;
  const Heic = root.SwiftConvertHeic;
  const Pdf = root.SwiftConvertPdf;
  const Docx = root.SwiftConvertDocx;
  const TextConv = root.SwiftConvertText;
  const Office = root.SwiftConvertOffice;
  const Ffmpeg = root.SwiftConvertFfmpeg;

  function sourceMime(file) {
    return Mime.mimeFromFile(file);
  }

  function alias(m) {
    return Catalog && Catalog.aliasMime ? Catalog.aliasMime(m) : Mime.normalizeMime(m);
  }

  async function convertDirect(file, targetMime) {
    const target = alias(targetMime);
    const src = alias(sourceMime(file));

    if (Heic && Heic.canConvert && Heic.canConvert(file, target)) {
      return Heic.convert(file, target);
    }
    if (Pdf && Pdf.canConvert && Pdf.canConvert(file, target)) {
      return Pdf.convert(file, target);
    }
    if (Docx && Docx.canConvert && Docx.canConvert(file, target)) {
      return Docx.convert(file, target);
    }
    if (TextConv && TextConv.canConvert && TextConv.canConvert(file, target)) {
      return TextConv.convert(file, target);
    }
    if (Office && Office.canConvert && Office.canConvert(file, target)) {
      return Office.convert(file, target);
    }
    if (Ffmpeg && Ffmpeg.canConvert && Ffmpeg.canConvert(file, target)) {
      return Ffmpeg.convert(file, target);
    }
    if (
      target === "application/pdf" &&
      src.startsWith("image/") &&
      src !== "image/svg+xml" &&
      PdfWrite &&
      PdfWrite.imageFileToPdf
    ) {
      return PdfWrite.imageFileToPdf(file);
    }
    if (Image && Image.canConvert(file, target)) {
      return Image.convertImage(file, target);
    }
    if (src.startsWith("image/") && target.startsWith("image/") && Image) {
      return Image.convertImage(file, target);
    }
    throw new Error(`No direct converter for ${src || "unknown"} → ${target}`);
  }

  function pathNeedsHost(path) {
    if (!path || path.length < 2) return false;
    for (let i = 0; i < path.length - 1; i++) {
      if (Catalog && Catalog.edgeNeedsHost(path[i], path[i + 1])) return true;
      // Fallback heuristics when catalog missing in older inject
      const a = path[i];
      const b = path[i + 1];
      if (a === "image/heic" || a === "image/heif") return true;
      if (a === "application/pdf") return true;
      if (a.includes("wordprocessingml") || a.includes("presentationml") || a.includes("spreadsheetml")) {
        return true;
      }
      if (a.startsWith("audio/") || a.startsWith("video/")) return true;
      if (b.startsWith("audio/") || b.startsWith("video/")) return true;
      if (a === "text/html" || a === "text/plain" || a === "text/csv") {
        if (b === "application/pdf") return true;
      }
    }
    return false;
  }

  function needsHost(file, targetMime) {
    const target = alias(targetMime);
    const src = alias(sourceMime(file));
    if (!Catalog) {
      if (Heic && Heic.isHeicFile && Heic.isHeicFile(file)) return true;
      if (Pdf && Pdf.isPdfFile && Pdf.isPdfFile(file)) return true;
      if (Docx && Docx.isDocxFile && Docx.isDocxFile(file)) return true;
      if (src.startsWith("audio/") || src.startsWith("video/")) return true;
      return false;
    }
    const path = Catalog.shortestPath(src, target);
    if (!path || path.length < 2) {
      // Still host if source family always needs host for any conversion
      if (src === "image/heic" || src === "image/heif" || src === "image/heic-sequence") return true;
      if (src === "application/pdf") return true;
      if (src.includes("wordprocessingml") || src.includes("msword")) return true;
      if (src.includes("presentationml") || src.includes("spreadsheetml")) return true;
      if (src.startsWith("audio/") || src.startsWith("video/")) return true;
      if (src === "text/plain" || src === "text/html" || src === "text/csv") {
        return target === "application/pdf";
      }
      return false;
    }
    return pathNeedsHost(path);
  }

  async function convertFile(file, targetMime) {
    const target = alias(targetMime);
    if (!target) return file;
    const src = alias(sourceMime(file));
    if (src === target) return file;

    let path = null;
    if (Catalog && Catalog.shortestPath) {
      path = Catalog.shortestPath(src, target);
    }

    // Prefer direct when available even without catalog path
    if (!path || path.length < 2) {
      return convertDirect(file, target);
    }

    // Single hop
    if (path.length === 2) {
      return convertDirect(file, target);
    }

    // Chain: convert hop by hop, renaming mime each step
    let working = file;
    for (let i = 1; i < path.length; i++) {
      const hopTarget = path[i];
      working = await convertDirect(working, hopTarget);
    }
    // Ensure final name/type match requested target
    if (alias(Mime.mimeFromFile(working)) !== target) {
      const name = Mime.renameWithExt(file.name, target);
      working = new File([working], name, { type: target, lastModified: Date.now() });
    }
    return working;
  }

  function canHandle(file, targetMime) {
    const target = alias(targetMime);
    if (!target) return false;
    const src = alias(sourceMime(file));
    if (src === target) return true;

    if (Catalog && Catalog.canReach) {
      if (Catalog.canReach(src, target)) return true;
    }

    // Module-level fallbacks (when catalog not injected yet)
    if (Heic && Heic.canConvert && Heic.canConvert(file, target)) return true;
    if (Pdf && Pdf.canConvert && Pdf.canConvert(file, target)) return true;
    if (Docx && Docx.canConvert && Docx.canConvert(file, target)) return true;
    if (TextConv && TextConv.canConvert && TextConv.canConvert(file, target)) return true;
    if (Office && Office.canConvert && Office.canConvert(file, target)) return true;
    if (Ffmpeg && Ffmpeg.canConvert && Ffmpeg.canConvert(file, target)) return true;

    if (src === "image/heic" || src === "image/heif" || src === "image/heic-sequence") {
      return (
        target.startsWith("image/") ||
        target === "application/pdf"
      );
    }
    if (src === "application/pdf") {
      return target.startsWith("image/") || target === "text/plain" || target === "application/zip";
    }
    if (src.includes("wordprocessingml") || src === "application/msword") {
      return (
        target === "text/plain" ||
        target === "text/html" ||
        target === "application/pdf" ||
        target.startsWith("image/")
      );
    }
    if (target === "application/pdf" && src.startsWith("image/") && src !== "image/svg+xml") {
      return true;
    }
    if (Image && Image.canConvert(file, target)) return true;
    return src.startsWith("image/") && target.startsWith("image/");
  }

  function targetsForFile(file) {
    const src = alias(sourceMime(file));
    if (Catalog && Catalog.toolsOptions) return Catalog.toolsOptions(src);
    return [
      ["image/png", "PNG"],
      ["image/jpeg", "JPEG"]
    ];
  }

  root.SwiftConvertRegistry = {
    convertFile,
    canHandle,
    needsHost,
    targetsForFile,
    convertDirect
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
