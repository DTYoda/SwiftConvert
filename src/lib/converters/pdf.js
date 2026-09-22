/**
 * PDF → raster image (page 1), multi-page ZIP, or plain text via pdf.js.
 * Expects `pdfjsLib` on globalThis (set by convert host module loader).
 * Optional JSZip for multi-page ZIP output.
 */
(function (root) {
  const Mime = root.SwiftConvertMime;
  const MAX_PAGES = 20;

  function isPdfFile(file) {
    const mime = Mime ? Mime.mimeFromFile(file) : (file && file.type) || "";
    if (mime === "application/pdf") return true;
    return String((file && file.name) || "")
      .toLowerCase()
      .endsWith(".pdf");
  }

  function getPdfjs() {
    const pdfjs = root.pdfjsLib || root.pdfjs;
    if (!pdfjs || !pdfjs.getDocument) {
      throw new Error("pdf.js is not loaded");
    }
    return pdfjs;
  }

  async function renderPageToBlob(page, targetMime) {
    const target = Mime.normalizeMime(targetMime) || "image/png";
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
    return new Promise((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve({ blob: b, mime }) : reject(new Error("PDF rasterize failed"))),
        mime,
        0.92
      )
    );
  }

  async function pdfToImage(file, targetMime, options) {
    const pdfjs = getPdfjs();
    const pageNum = (options && options.page) || 1;
    const data = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
    try {
      const page = await doc.getPage(Math.min(pageNum, doc.numPages));
      const { blob, mime } = await renderPageToBlob(page, targetMime);
      const name = Mime.renameWithExt(file.name, mime);
      return new File([blob], name, { type: mime, lastModified: Date.now() });
    } finally {
      await doc.destroy();
    }
  }

  async function pdfToImagesZip(file, targetMime) {
    const JSZip = root.JSZip;
    if (!JSZip) throw new Error("JSZip is not loaded");
    const pdfjs = getPdfjs();
    const data = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
    try {
      const zip = new JSZip();
      const pages = Math.min(doc.numPages, MAX_PAGES);
      const imageMime = "image/png";
      for (let i = 1; i <= pages; i++) {
        const page = await doc.getPage(i);
        const { blob } = await renderPageToBlob(page, imageMime);
        const pad = String(i).padStart(3, "0");
        zip.file(`page-${pad}.png`, blob);
      }
      const out = await zip.generateAsync({ type: "blob" });
      const base = String(file.name || "document").replace(/\.[^.]+$/, "") || "document";
      return new File([out], base + "-pages.zip", {
        type: "application/zip",
        lastModified: Date.now()
      });
    } finally {
      await doc.destroy();
    }
  }

  async function pdfToText(file) {
    const pdfjs = getPdfjs();
    const data = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
    try {
      const pages = Math.min(doc.numPages, MAX_PAGES);
      const chunks = [];
      for (let i = 1; i <= pages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const text = (content.items || [])
          .map((it) => (it && it.str) || "")
          .join(" ");
        chunks.push(text);
      }
      const body = chunks.join("\n\n").trim() + "\n";
      const name = Mime.renameWithExt(file.name, "text/plain");
      return new File([body], name, { type: "text/plain", lastModified: Date.now() });
    } finally {
      await doc.destroy();
    }
  }

  async function convert(file, targetMime) {
    const target = Mime.normalizeMime(targetMime);
    if (target === "text/plain") return pdfToText(file);
    if (target === "application/zip") return pdfToImagesZip(file, "image/png");
    if (target.startsWith("image/")) return pdfToImage(file, target);
    throw new Error("Unsupported PDF target: " + target);
  }

  function canConvert(file, targetMime) {
    if (!isPdfFile(file)) return false;
    const t = Mime.normalizeMime(targetMime);
    return t.startsWith("image/") || t === "text/plain" || t === "application/zip";
  }

  root.SwiftConvertPdf = {
    convert,
    canConvert,
    isPdfFile,
    pdfToImage,
    pdfToText,
    pdfToImagesZip,
    MAX_PAGES
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
