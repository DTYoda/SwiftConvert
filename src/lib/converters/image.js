/**
 * Image converter using Canvas / createImageBitmap.
 * Supports JPEG, PNG, WebP, GIF (first frame), BMP, SVG → PNG/JPEG/WebP.
 */
(function (root) {
  const Mime = root.SwiftConvertMime;

  async function blobToImageBitmap(blob) {
    if (typeof createImageBitmap === "function") {
      try {
        return await createImageBitmap(blob);
      } catch (_) {
        /* fall through for SVG */
      }
    }
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

  async function svgFileToImage(file) {
    const text = await file.text();
    // Force XML namespace if missing; strip scripts for safety
    let svg = text.replace(/<script[\s\S]*?<\/script>/gi, "");
    if (!/xmlns=/.test(svg)) {
      svg = svg.replace(
        /<svg\b/i,
        '<svg xmlns="http://www.w3.org/2000/svg"'
      );
    }
    const url =
      "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Failed to decode SVG"));
      el.src = url;
    });
    return img;
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
    if (
      sourceMime === "image/heic" ||
      sourceMime === "image/heif" ||
      sourceMime === "image/heic-sequence"
    ) {
      throw new Error("HEIC/HEIF requires the SwiftConvert host converter");
    }

    let bitmap;
    if (sourceMime === "image/svg+xml") {
      bitmap = await svgFileToImage(file);
    } else {
      bitmap = await blobToImageBitmap(file);
    }

    const w = bitmap.width || bitmap.naturalWidth || 800;
    const h = bitmap.height || bitmap.naturalHeight || 600;
    if (!w || !h) throw new Error("Could not read image dimensions");

    let canvas;
    let ctx;
    if (typeof OffscreenCanvas !== "undefined" && sourceMime !== "image/svg+xml") {
      canvas = new OffscreenCanvas(w, h);
      ctx = canvas.getContext("2d");
    } else {
      canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      ctx = canvas.getContext("2d");
    }
    if (!ctx) throw new Error("Canvas 2D unavailable");

    if (targetMime === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    if (bitmap.close) bitmap.close();

    let outMime = targetMime;
    const quality = outMime === "image/jpeg" || outMime === "image/webp" ? 0.92 : undefined;
    let blob;
    try {
      blob = await canvasToBlob(canvas, outMime, quality);
    } catch (err) {
      if (outMime === "image/webp") {
        blob = await canvasToBlob(canvas, "image/png");
        outMime = "image/png";
      } else {
        throw err;
      }
    }

    const name = Mime.renameWithExt(file.name, outMime);
    return new File([blob], name, {
      type: outMime,
      lastModified: Date.now()
    });
  }

  function canConvert(file, targetMime) {
    const src = Mime.mimeFromFile(file);
    if (!src.startsWith("image/") || !targetMime.startsWith("image/")) return false;
    if (
      src === "image/heic" ||
      src === "image/heif" ||
      src === "image/heic-sequence"
    ) {
      return false;
    }
    return true;
  }

  root.SwiftConvertImage = { convertImage, canConvert };
})(typeof globalThis !== "undefined" ? globalThis : self);
