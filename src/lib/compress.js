/**
 * Image compression via Canvas / createImageBitmap.
 * Steps quality down, then scales dimensions, until under a byte budget
 * (or until min quality / min dimension floors are hit).
 *
 * CSP-safe: no workers, no blob: worker URLs — only canvas encode + object URLs for decode fallback.
 */
(function (root) {
  const Mime = root.SwiftConvertMime;

  const QUALITY_PRESETS = {
    high: { start: 0.92, floor: 0.55, step: 0.06 },
    balanced: { start: 0.85, floor: 0.45, step: 0.07 },
    small: { start: 0.72, floor: 0.35, step: 0.08 }
  };

  async function blobToImageBitmap(blob) {
    if (typeof createImageBitmap === "function") {
      return createImageBitmap(blob);
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

  function makeCanvas(w, h) {
    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext("2d");
      return { canvas, ctx };
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    return { canvas, ctx };
  }

  function pickOutputMime(file, preferredMime) {
    if (preferredMime && String(preferredMime).startsWith("image/")) {
      const m = Mime.normalizeMime(preferredMime);
      if (m === "image/jpeg" || m === "image/webp" || m === "image/png") return m;
    }
    const src = Mime.mimeFromFile(file);
    if (src === "image/jpeg" || src === "image/webp" || src === "image/png") return src;
    return "image/jpeg";
  }

  function presetFor(pref) {
    return QUALITY_PRESETS[pref] || QUALITY_PRESETS.balanced;
  }

  /**
   * @param {File|Blob} file
   * @param {object} opts
   * @param {number} [opts.maxBytes] — stop when blob.size ≤ maxBytes
   * @param {number} [opts.quality] — fixed quality 0–1 (manual mode)
   * @param {number} [opts.maxWidth]
   * @param {number} [opts.maxHeight]
   * @param {string} [opts.mime]
   * @param {string} [opts.qualityPref] — high | balanced | small
   * @param {string} [opts.fileName]
   */
  async function compressImage(file, opts) {
    opts = opts || {};
    const srcMime = Mime.mimeFromFile(file);
    if (!srcMime.startsWith("image/") || srcMime === "image/svg+xml") {
      throw new Error("Not a compressible raster image");
    }
    if (
      srcMime === "image/heic" ||
      srcMime === "image/heif" ||
      srcMime === "image/heic-sequence"
    ) {
      throw new Error("HEIC must be converted before compression");
    }

    const bitmap = await blobToImageBitmap(file);
    let srcW = bitmap.width || bitmap.naturalWidth;
    let srcH = bitmap.height || bitmap.naturalHeight;
    if (!srcW || !srcH) {
      if (bitmap.close) bitmap.close();
      throw new Error("Could not read image dimensions");
    }

    let outMime = pickOutputMime(file, opts.mime);
    const preset = presetFor(opts.qualityPref);
    const maxBytes = opts.maxBytes > 0 ? Math.floor(opts.maxBytes) : 0;
    const fixedQuality =
      typeof opts.quality === "number" && opts.quality > 0 && opts.quality <= 1
        ? opts.quality
        : null;

    let scale = 1;
    if (opts.maxWidth > 0 && srcW * scale > opts.maxWidth) scale = opts.maxWidth / srcW;
    if (opts.maxHeight > 0 && srcH * scale > opts.maxHeight) scale = opts.maxHeight / srcH;

    let bestBlob = null;
    let bestMime = outMime;
    let bestW = srcW;
    let bestH = srcH;

    const tryEncode = async (w, h, mime, quality) => {
      const { canvas, ctx } = makeCanvas(w, h);
      if (!ctx) throw new Error("Canvas 2D unavailable");
      if (mime === "image/jpeg") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
      }
      ctx.drawImage(bitmap, 0, 0, w, h);
      let q = mime === "image/png" ? undefined : quality;
      try {
        return await canvasToBlob(canvas, mime, q);
      } catch (err) {
        if (mime === "image/webp") {
          return canvasToBlob(canvas, "image/jpeg", quality);
        }
        throw err;
      }
    };

    // Dimension ladder: full size → scale down until under budget or floor
    for (let dimPass = 0; dimPass < 12; dimPass++) {
      const w = Math.max(16, Math.round(srcW * scale));
      const h = Math.max(16, Math.round(srcH * scale));

      let mime = outMime;
      // PNG rarely shrinks via quality — switch to JPEG when chasing a byte budget
      if (maxBytes && mime === "image/png" && (!bestBlob || bestBlob.size > maxBytes)) {
        mime = "image/jpeg";
      }

      if (fixedQuality != null) {
        let blob = await tryEncode(w, h, mime, fixedQuality);
        if (blob.type) mime = blob.type;
        bestBlob = blob;
        bestMime = mime;
        bestW = w;
        bestH = h;
        if (!maxBytes || blob.size <= maxBytes) break;
      } else {
        let quality = preset.start;
        while (quality >= preset.floor - 0.001) {
          let blob = await tryEncode(w, h, mime, quality);
          if (blob.type) mime = blob.type;
          if (!bestBlob || blob.size < bestBlob.size) {
            bestBlob = blob;
            bestMime = mime;
            bestW = w;
            bestH = h;
          }
          if (!maxBytes || blob.size <= maxBytes) {
            bestBlob = blob;
            bestMime = mime;
            bestW = w;
            bestH = h;
            quality = -1; // done
            break;
          }
          quality -= preset.step;
        }
        if (quality < 0) break;
      }

      if (!maxBytes) break;
      if (bestBlob && bestBlob.size <= maxBytes) break;
      if (w <= 64 || h <= 64) break;
      scale *= 0.82;
    }

    if (bitmap.close) bitmap.close();
    if (!bestBlob) throw new Error("Compression produced no output");

    const baseName =
      opts.fileName ||
      (file && file.name) ||
      "image";
    const name = Mime.renameWithExt(baseName, bestMime);
    return new File([bestBlob], name, {
      type: bestMime,
      lastModified: Date.now()
    });
  }

  /**
   * Compress only when over maxBytes. Returns original file if already small enough
   * or if compression cannot improve enough (still returns best effort when over).
   */
  async function compressImageToFit(file, maxBytes, opts) {
    opts = opts || {};
    if (!file || !(maxBytes > 0)) return { file, compressed: false };
    if (file.size <= maxBytes) return { file, compressed: false };

    const out = await compressImage(file, {
      ...opts,
      maxBytes,
      fileName: file.name
    });

    if (out.size >= file.size && out.type === (file.type || Mime.mimeFromFile(file))) {
      // No improvement — keep original unless we had to change format meaningfully
      return { file, compressed: false };
    }
    return { file: out, compressed: true, fromBytes: file.size, toBytes: out.size };
  }

  function canCompress(file) {
    const src = Mime.mimeFromFile(file);
    return (
      src.startsWith("image/") &&
      src !== "image/svg+xml" &&
      src !== "image/heic" &&
      src !== "image/heif" &&
      src !== "image/heic-sequence"
    );
  }

  root.SwiftConvertCompress = {
    compressImage,
    compressImageToFit,
    canCompress,
    QUALITY_PRESETS
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
