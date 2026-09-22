/**
 * HTML → canvas raster helpers for visual DOCX / office renders.
 * Runs in convert host (has DOM). Best-effort layout, not print-perfect.
 */
(function (root) {
  const DEFAULT_WIDTH = 794; // ~A4 @ 96dpi
  const MAX_HEIGHT = 4000;

  function escapeXml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * Measure rendered HTML height in a hidden iframe.
   */
  async function measureHtml(html, width) {
    const w = width || DEFAULT_WIDTH;
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText =
      "position:fixed;left:-10000px;top:0;width:" +
      w +
      "px;height:200px;border:0;opacity:0;pointer-events:none;";
    document.body.appendChild(iframe);
    try {
      const doc = iframe.contentDocument;
      doc.open();
      doc.write(
        "<!DOCTYPE html><html><head><meta charset=\"utf-8\">" +
          "<style>html,body{margin:0;padding:0;background:#fff;}" +
          "body{width:" +
          w +
          "px;font:16px/1.45 Georgia,\"Times New Roman\",serif;color:#111;padding:32px;box-sizing:border-box;}" +
          "img{max-width:100%;height:auto;} table{border-collapse:collapse;width:100%;}" +
          "td,th{border:1px solid #ccc;padding:4px 8px;}</style></head><body>" +
          html +
          "</body></html>"
      );
      doc.close();
      await new Promise((r) => setTimeout(r, 30));
      const body = doc.body;
      const h = Math.min(
        MAX_HEIGHT,
        Math.max(120, Math.ceil(body.scrollHeight || body.offsetHeight || 120))
      );
      return { width: w, height: h, bodyHtml: body.innerHTML };
    } finally {
      iframe.remove();
    }
  }

  /**
   * Rasterize HTML fragment to a canvas via SVG foreignObject.
   * @returns {Promise<HTMLCanvasElement>}
   */
  async function htmlToCanvas(html, options) {
    const width = (options && options.width) || DEFAULT_WIDTH;
    const measured = await measureHtml(html, width);
    const height = (options && options.height) || measured.height;
    const bodyHtml = measured.bodyHtml;

    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="' +
      width +
      '" height="' +
      height +
      '">' +
      '<foreignObject width="100%" height="100%">' +
      '<div xmlns="http://www.w3.org/1999/xhtml" style="width:' +
      width +
      "px;margin:0;padding:32px;box-sizing:border-box;background:#fff;font:16px/1.45 Georgia,'Times New Roman',serif;color:#111;\">" +
      bodyHtml +
      "</div></foreignObject></svg>";

    const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("HTML visual render failed"));
      el.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0);
    return canvas;
  }

  function canvasToBlob(canvas, mime, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("canvas encode failed"))),
        mime,
        quality
      );
    });
  }

  /**
   * Slice a tall canvas into page-sized JPEG bitmaps for multi-page PDF.
   */
  async function canvasToPageJpegs(canvas, pageHeight) {
    const ph = pageHeight || 1123; // ~A4 @ 96dpi * 1.41
    const pages = [];
    const total = canvas.height;
    let y = 0;
    let index = 0;
    while (y < total && index < 40) {
      const h = Math.min(ph, total - y);
      const page = document.createElement("canvas");
      page.width = canvas.width;
      page.height = h;
      const ctx = page.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, page.width, page.height);
      ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
      const blob = await canvasToBlob(page, "image/jpeg", 0.9);
      pages.push({
        bytes: new Uint8Array(await blob.arrayBuffer()),
        width: page.width,
        height: page.height
      });
      y += h;
      index += 1;
    }
    return pages;
  }

  root.SwiftConvertHtmlRender = {
    htmlToCanvas,
    canvasToBlob,
    canvasToPageJpegs,
    measureHtml,
    DEFAULT_WIDTH,
    escapeXml
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
