/**
 * TXT / HTML / CSV → PDF or plain text.
 * Lightweight writers; PDF via pdf-write text path.
 */
(function (root) {
  const Mime = root.SwiftConvertMime;
  const PdfWrite = root.SwiftConvertPdfWrite;

  function sourceMime(file) {
    return Mime ? Mime.mimeFromFile(file) : (file && file.type) || "";
  }

  function isTextish(file) {
    const m = sourceMime(file);
    if (m === "text/plain" || m === "text/html" || m === "text/csv" || m === "application/csv") {
      return true;
    }
    const name = String((file && file.name) || "").toLowerCase();
    return /\.(txt|html?|csv)$/.test(name);
  }

  function stripHtml(html) {
    return String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
  }

  async function toPlainText(file) {
    const m = sourceMime(file);
    const raw = await file.text();
    if (m === "text/html") return stripHtml(raw);
    return raw;
  }

  async function convert(file, targetMime) {
    const target = Mime.normalizeMime(targetMime);
    if (target === "text/plain") {
      const text = await toPlainText(file);
      const name = Mime.renameWithExt(file.name, "text/plain");
      return new File([text], name, { type: "text/plain", lastModified: Date.now() });
    }
    if (target === "application/pdf") {
      if (!PdfWrite || !PdfWrite.textToPdfFile) {
        throw new Error("PDF text writer unavailable");
      }
      const text = await toPlainText(file);
      return PdfWrite.textToPdfFile(text, file.name);
    }
    throw new Error("Unsupported text target: " + target);
  }

  function canConvert(file, targetMime) {
    if (!isTextish(file)) return false;
    const t = Mime.normalizeMime(targetMime);
    return t === "text/plain" || t === "application/pdf";
  }

  root.SwiftConvertText = { convert, canConvert, isTextish };
})(typeof globalThis !== "undefined" ? globalThis : self);
