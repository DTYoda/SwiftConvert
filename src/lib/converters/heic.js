/**
 * HEIC/HEIF → JPEG / PNG / WebP via libheif-js WASM (+ canvas encode).
 * Expects global `libheif` from libheif-bundle.js (factory or module).
 * Prefer the convert host / extension pages — WASM needs wasm-unsafe-eval only
 * (no unsafe-eval; heic2any workers are incompatible with Chrome MV3 CSP).
 */
(function (root) {
  const Mime = root.SwiftConvertMime;
  let libheifApi = null;

  function isHeicFile(file) {
    const mime = Mime ? Mime.mimeFromFile(file) : (file && file.type) || "";
    if (mime === "image/heic" || mime === "image/heif" || mime === "image/heic-sequence") {
      return true;
    }
    const name = String((file && file.name) || "").toLowerCase();
    return name.endsWith(".heic") || name.endsWith(".heif");
  }

  async function getLibheif() {
    if (libheifApi) return libheifApi;
    if (typeof libheif === "undefined") {
      throw new Error("libheif library is not loaded");
    }
    // Script tag exposes a factory; CJS wasm-bundle already invokes it.
    const api = typeof libheif === "function" ? libheif() : libheif;
    if (api && api.ready) await api.ready;
    if (!api || typeof api.HeifDecoder !== "function") {
      throw new Error("libheif HeifDecoder unavailable");
    }
    libheifApi = api;
    return libheifApi;
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

  async function decodeHeicToImageData(file) {
    const api = await getLibheif();
    const buffer = await file.arrayBuffer();
    const decoder = new api.HeifDecoder();
    let images;
    try {
      images = decoder.decode(buffer);
    } catch (err) {
      throw new Error(
        "HEIC decode failed: " + (err && err.message ? err.message : String(err))
      );
    }
    if (!images || !images.length) {
      throw new Error("HEIC conversion returned empty result");
    }

    const image = images[0];
    const width = image.get_width();
    const height = image.get_height();
    if (!width || !height) {
      throw new Error("Could not read HEIC dimensions");
    }

    try {
      const displayData = await new Promise((resolve, reject) => {
        image.display(
          { data: new Uint8ClampedArray(width * height * 4), width, height },
          (result) => {
            if (!result) reject(new Error("HEIF processing error"));
            else resolve(result);
          }
        );
      });
      return {
        width: displayData.width || width,
        height: displayData.height || height,
        data: displayData.data
      };
    } finally {
      for (const img of images) {
        try {
          if (img && typeof img.free === "function") img.free();
        } catch (_) {
          /* ignore */
        }
      }
      try {
        if (decoder.decoder && typeof decoder.decoder.delete === "function") {
          decoder.decoder.delete();
        }
      } catch (_) {
        /* ignore */
      }
    }
  }

  async function heicToRaster(file, targetMime) {
    const want = Mime ? Mime.normalizeMime(targetMime || "image/jpeg") : targetMime || "image/jpeg";
    const outMime =
      want === "image/png" || want === "image/webp" || want === "image/gif"
        ? want === "image/gif"
          ? "image/png"
          : want
        : "image/jpeg";

    const { width, height, data } = await decodeHeicToImageData(file);

    let canvas;
    let ctx;
    if (typeof OffscreenCanvas !== "undefined") {
      canvas = new OffscreenCanvas(width, height);
      ctx = canvas.getContext("2d");
    } else {
      canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      ctx = canvas.getContext("2d");
    }
    if (!ctx) throw new Error("Canvas 2D unavailable");

    const imageData =
      typeof ImageData === "function"
        ? new ImageData(data, width, height)
        : { data, width, height };
    ctx.putImageData(imageData, 0, 0);

    const quality = outMime === "image/png" ? undefined : 0.92;
    const blob = await canvasToBlob(canvas, outMime, quality);
    if (!blob) throw new Error("HEIC conversion returned empty result");

    const name = Mime
      ? Mime.renameWithExt(file.name, outMime)
      : String(file.name || "image").replace(/\.(heic|heif)$/i, "") +
        (outMime === "image/png" ? ".png" : outMime === "image/webp" ? ".webp" : ".jpg");
    return new File([blob], name, { type: outMime, lastModified: Date.now() });
  }

  function canConvert(file, targetMime) {
    if (!isHeicFile(file)) return false;
    const t = Mime.normalizeMime(targetMime);
    return t === "image/jpeg" || t === "image/png" || t === "image/webp" || t === "image/gif";
  }

  root.SwiftConvertHeic = { convert: heicToRaster, canConvert, isHeicFile };
})(typeof globalThis !== "undefined" ? globalThis : self);
