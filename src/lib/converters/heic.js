/**
 * HEIC/HEIF → JPEG / PNG / WebP via heic2any (+ canvas for WebP).
 * Expects global `heic2any` (vendored). Prefer running in the convert host
 * (extension page) — WASM is unreliable under arbitrary page CSPs.
 */
(function (root) {
  const Mime = root.SwiftConvertMime;

  function isHeicFile(file) {
    const mime = Mime ? Mime.mimeFromFile(file) : (file && file.type) || "";
    if (mime === "image/heic" || mime === "image/heif" || mime === "image/heic-sequence") {
      return true;
    }
    const name = String((file && file.name) || "").toLowerCase();
    return name.endsWith(".heic") || name.endsWith(".heif");
  }

  async function heicToRaster(file, targetMime) {
    if (typeof heic2any !== "function") {
      throw new Error("heic2any library is not loaded");
    }
    const want = targetMime || "image/jpeg";
    // heic2any supports image/jpeg, image/png, image/gif
    const intermediate =
      want === "image/png" || want === "image/gif" ? want : "image/jpeg";

    const result = await heic2any({
      blob: file,
      toType: intermediate,
      quality: 0.92
    });
    const blob = Array.isArray(result) ? result[0] : result;
    if (!blob) throw new Error("HEIC conversion returned empty result");

    if (want === "image/webp") {
      const bmp = await createImageBitmap(blob);
      const canvas =
        typeof OffscreenCanvas !== "undefined"
          ? new OffscreenCanvas(bmp.width, bmp.height)
          : Object.assign(document.createElement("canvas"), {
              width: bmp.width,
              height: bmp.height
            });
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bmp, 0, 0);
      if (bmp.close) bmp.close();
      const webp = canvas.convertToBlob
        ? await canvas.convertToBlob({ type: "image/webp", quality: 0.92 })
        : await new Promise((resolve, reject) =>
            canvas.toBlob(
              (b) => (b ? resolve(b) : reject(new Error("WebP encode failed"))),
              "image/webp",
              0.92
            )
          );
      const name = Mime.renameWithExt(file.name, "image/webp");
      return new File([webp], name, { type: "image/webp", lastModified: Date.now() });
    }

    const outMime = blob.type || intermediate;
    const name = Mime.renameWithExt(file.name, outMime);
    return new File([blob], name, { type: outMime, lastModified: Date.now() });
  }

  function canConvert(file, targetMime) {
    if (!isHeicFile(file)) return false;
    const t = Mime.normalizeMime(targetMime);
    return t === "image/jpeg" || t === "image/png" || t === "image/webp" || t === "image/gif";
  }

  root.SwiftConvertHeic = { convert: heicToRaster, canConvert, isHeicFile };
})(typeof globalThis !== "undefined" ? globalThis : self);
