/**
 * PDF → raster image (page 1) via pdf.js.
 * Expects `pdfjsLib` on globalThis (set by convert host module loader).
 */
(function (root) {
  const Mime = root.SwiftConvertMime;

  function isPdfFile(file) {
    const mime = Mime ? Mime.mimeFromFile(file) : (file && file.type) || "";
    if (mime === "application/pdf") return true;
    return String((file && file.name) || "")
      .toLowerCase()
      .endsWith(".pdf");
  }

  async function pdfToImage(file, targetMime, options) {
    const pdfjs = root.pdfjsLib || root.pdfjs;
    if (!pdfjs || !pdfjs.getDocument) {
      throw new Error("pdf.js is not loaded");
    }
    const target = Mime.normalizeMime(targetMime) || "image/png";
    const pageNum = (options && options.page) || 1;
    const data = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
    try {
      const page = await doc.getPage(Math.min(pageNum, doc.numPages));
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport }).promise;

      const mime =
        target === "image/jpeg" || target === "image/webp" ? target : "image/png";
      if (mime === "image/jpeg") {
        ctx.globalCompositeOperation = "destination-over";
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      const blob = await new Promise((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("PDF rasterize failed"))),
          mime,
          0.92
        )
      );
      const name = Mime.renameWithExt(file.name, mime);
      return new File([blob], name, { type: mime, lastModified: Date.now() });
    } finally {
      await doc.destroy();
    }
  }

  function canConvert(file, targetMime) {
    if (!isPdfFile(file)) return false;
    const t = Mime.normalizeMime(targetMime);
    return t.startsWith("image/");
  }

  root.SwiftConvertPdf = { convert: pdfToImage, canConvert, isPdfFile };
})(typeof globalThis !== "undefined" ? globalThis : self);
