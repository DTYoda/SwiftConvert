/**
 * Image converter using Canvas / createImageBitmap.
 * Supports JPEG, PNG, WebP, GIF (first frame), BMP → PNG/JPEG/WebP.
 */
(function (root) {
  const Mime = root.SwiftConvertMime;

  async function blobToImageBitmap(blob) {
    if (typeof createImageBitmap === "function") {
      return createImageBitmap(blob);
    }
    // Fallback via HTMLImageElement
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("Failed to decode image"));
        el.src = url;
      });
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function canvasToBlob(canvas, mime, quality) {
    return new Promise((resolve, reject) => {
      if (canvas.convertToBlob) {
        canvas
          .convertToBlob({ type: mime, quality })
          .then(resolve)
          .catch(reject);
        return;
      }
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
        mime,
        quality
      );
    });
  }

  async function convertImage(file, targetMime) {
    const sourceMime = Mime.mimeFromFile(file);
    if (!sourceMime.startsWith("image/")) {
      throw new Error(`Not an image: ${sourceMime || "unknown"}`);
    }
    if (!targetMime.startsWith("image/")) {
      throw new Error(`Unsupported image target: ${targetMime}`);
    }
    if (sourceMime === "image/svg+xml") {
      throw new Error("SVG conversion not supported in this slice");
    }

    const bitmap = await blobToImageBitmap(file);
    const w = bitmap.width || bitmap.naturalWidth;
    const h = bitmap.height || bitmap.naturalHeight;
    if (!w || !h) throw new Error("Could not read image dimensions");

    let canvas;
    let ctx;
    if (typeof OffscreenCanvas !== "undefined") {
      canvas = new OffscreenCanvas(w, h);
      ctx = canvas.getContext("2d");
    } else {
      canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      ctx = canvas.getContext("2d");
    }
    if (!ctx) throw new Error("Canvas 2D unavailable");

    // White background for JPEG (no alpha)
    if (targetMime === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    if (bitmap.close) bitmap.close();

    const quality = targetMime === "image/jpeg" || targetMime === "image/webp" ? 0.92 : undefined;
    let blob;
    try {
      blob = await canvasToBlob(canvas, targetMime, quality);
    } catch (err) {
      // Some browsers reject webp encode — fall back to png
      if (targetMime === "image/webp") {
        blob = await canvasToBlob(canvas, "image/png");
        targetMime = "image/png";
      } else {
        throw err;
      }
    }

    const name = Mime.renameWithExt(file.name, targetMime);
    return new File([blob], name, {
      type: targetMime,
      lastModified: Date.now()
    });
  }

  function canConvert(file, targetMime) {
    const src = Mime.mimeFromFile(file);
    return (
      src.startsWith("image/") &&
      src !== "image/svg+xml" &&
      targetMime.startsWith("image/")
    );
  }

  root.SwiftConvertImage = { convertImage, canConvert };
})(typeof globalThis !== "undefined" ? globalThis : self);
