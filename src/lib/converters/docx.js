/**
 * DOCX → plain text, HTML, or simple text PDF via mammoth.
 * Expects global `mammoth` (vendored browser build).
 */
(function (root) {
  const Mime = root.SwiftConvertMime;
  const PdfWrite = root.SwiftConvertPdfWrite;

  const DOCX =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  function isDocxFile(file) {
    const mime = Mime ? Mime.mimeFromFile(file) : (file && file.type) || "";
    if (mime === DOCX || mime === "application/msword") return true;
    const name = String((file && file.name) || "").toLowerCase();
    return name.endsWith(".docx") || name.endsWith(".doc");
  }

  async function convertDocx(file, targetMime) {
    if (typeof mammoth === "undefined") {
      throw new Error("mammoth library is not loaded");
    }
    const target = Mime.normalizeMime(targetMime);
    const arrayBuffer = await file.arrayBuffer();

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

    if (target === "application/pdf") {
      if (!PdfWrite || !PdfWrite.textToPdfFile) {
        throw new Error("PDF text writer unavailable");
      }
      return PdfWrite.textToPdfFile(text, file.name);
    }

    // default: plain text
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
      t === "application/pdf"
    );
  }

  root.SwiftConvertDocx = { convert: convertDocx, canConvert, isDocxFile, DOCX };
})(typeof globalThis !== "undefined" ? globalThis : self);
