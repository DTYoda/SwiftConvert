/**
 * DOCX → plain text, HTML, visual image/PDF (HTML render), or text PDF fallback.
 * Expects global `mammoth` (vendored browser build). Visual path needs host DOM.
 */
(function (root) {
  const Mime = root.SwiftConvertMime;
  const PdfWrite = root.SwiftConvertPdfWrite;
  const HtmlRender = root.SwiftConvertHtmlRender;

  const DOCX =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  function isDocxFile(file) {
    const mime = Mime ? Mime.mimeFromFile(file) : (file && file.type) || "";
    if (mime === DOCX || mime === "application/msword") return true;
    const name = String((file && file.name) || "").toLowerCase();
    return name.endsWith(".docx") || name.endsWith(".doc");
  }

  async function docxToHtmlFragment(arrayBuffer) {
    if (typeof mammoth === "undefined") {
      throw new Error("mammoth library is not loaded");
    }
    const result = await mammoth.convertToHtml({ arrayBuffer });
    return result.value || "";
  }

  async function convertVisualImage(file, targetMime) {
    if (!HtmlRender || !HtmlRender.htmlToCanvas) {
      throw new Error("HTML visual renderer unavailable (convert host required)");
    }
    const arrayBuffer = await file.arrayBuffer();
    const fragment = await docxToHtmlFragment(arrayBuffer);
    const canvas = await HtmlRender.htmlToCanvas(fragment);
    const want = Mime.normalizeMime(targetMime);
    const mime =
      want === "image/jpeg" || want === "image/webp" ? want : "image/png";
    if (mime === "image/jpeg") {
      const ctx = canvas.getContext("2d");
      // already white bg from renderer
      void ctx;
    }
    const quality = mime === "image/png" ? undefined : 0.92;
    const blob = await HtmlRender.canvasToBlob(canvas, mime, quality);
    const name = Mime.renameWithExt(file.name, mime);
    return new File([blob], name, { type: mime, lastModified: Date.now() });
  }

  async function convertVisualPdf(file) {
    if (!HtmlRender || !HtmlRender.htmlToCanvas) {
      throw new Error("HTML visual renderer unavailable (convert host required)");
    }
    if (!PdfWrite || !PdfWrite.imagesToPdfFile) {
      // Fall back: single-page via imageFileToPdf
      const png = await convertVisualImage(file, "image/png");
      if (!PdfWrite || !PdfWrite.imageFileToPdf) {
        throw new Error("PDF writer unavailable");
      }
      return PdfWrite.imageFileToPdf(png);
    }
    const arrayBuffer = await file.arrayBuffer();
    const fragment = await docxToHtmlFragment(arrayBuffer);
    const canvas = await HtmlRender.htmlToCanvas(fragment);
    const pages = await HtmlRender.canvasToPageJpegs(canvas);
    return PdfWrite.imagesToPdfFile(pages, file.name);
  }

  async function convertDocx(file, targetMime) {
    if (typeof mammoth === "undefined") {
      throw new Error("mammoth library is not loaded");
    }
    const target = Mime.normalizeMime(targetMime);
    const arrayBuffer = await file.arrayBuffer();

    if (target.startsWith("image/")) {
      return convertVisualImage(file, target);
    }

    if (target === "application/pdf") {
      try {
        return await convertVisualPdf(file);
      } catch (err) {
        // Best-effort: fall back to text PDF and label via filename suffix
        const raw = await mammoth.extractRawText({ arrayBuffer });
        const text = (raw && raw.value) || "";
        if (!PdfWrite || !PdfWrite.textToPdfFile) {
          throw err;
        }
        const pdf = PdfWrite.textToPdfFile(text, file.name);
        const name = Mime.renameWithExt(
          String(file.name || "document").replace(/\.[^.]+$/, "") + "-text",
          "application/pdf"
        );
        return new File([pdf], name, { type: "application/pdf", lastModified: Date.now() });
      }
    }

    if (target === "text/html" || target === "application/xhtml+xml") {
      const result = await mammoth.convertToHtml({ arrayBuffer });
      const html =
        "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>" +
        String(file.name || "document").replace(/[<>&]/g, "") +
        "</title></head><body>" +
        result.value +
        "</body></html>";
      const name = Mime.renameWithExt(file.name, "text/html");
      return new File([html], name, { type: "text/html", lastModified: Date.now() });
    }

    const raw = await mammoth.extractRawText({ arrayBuffer });
    const text = (raw && raw.value) || "";
    const name = Mime.renameWithExt(file.name, "text/plain");
    return new File([text], name, { type: "text/plain", lastModified: Date.now() });
  }

  function canConvert(file, targetMime) {
    if (!isDocxFile(file)) return false;
    const t = Mime.normalizeMime(targetMime);
    return (
      t === "text/plain" ||
      t === "text/html" ||
      t === "application/xhtml+xml" ||
      t === "application/pdf" ||
      t === "image/png" ||
      t === "image/jpeg" ||
      t === "image/webp" ||
      t === "image/gif"
    );
  }

  root.SwiftConvertDocx = {
    convert: convertDocx,
    canConvert,
    isDocxFile,
    DOCX,
    convertVisualImage,
    convertVisualPdf
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
