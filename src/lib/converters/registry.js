/**
 * Converter registry — routes by target MIME family.
 */
(function (root) {
  const Mime = root.SwiftConvertMime;
  const Image = root.SwiftConvertImage;
  const Stubs = root.SwiftConvertStubs;

  async function convertFile(file, targetMime) {
    const target = Mime.normalizeMime(targetMime);
    if (!target) return file;

    if (Image && Image.canConvert(file, target)) {
      return Image.convertImage(file, target);
    }

    if (Stubs && Stubs.isStubTarget(target)) {
      const stub = Stubs.getStub(target);
      throw new Error(`${stub.label} conversion is not available yet.`);
    }

    // Try image path if source is image even when target looked exotic
    const src = Mime.mimeFromFile(file);
    if (src.startsWith("image/") && target.startsWith("image/")) {
      return Image.convertImage(file, target);
    }

    throw new Error(`No converter for ${src || "unknown"} → ${target}`);
  }

  function canHandle(file, targetMime) {
    const target = Mime.normalizeMime(targetMime);
    if (!target) return false;
    if (Image && Image.canConvert(file, target)) return true;
    if (Stubs && Stubs.isStubTarget(target)) return false; // known but not ready
    const src = Mime.mimeFromFile(file);
    return src.startsWith("image/") && target.startsWith("image/");
  }

  root.SwiftConvertRegistry = { convertFile, canHandle };
})(typeof globalThis !== "undefined" ? globalThis : self);
