/**
 * MIME / accept inference helpers (classic + ESM friendly).
 * Attaches to globalThis.SwiftConvertMime when loaded as a classic script.
 */
(function (root) {
  const IMAGE_EXT = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    avif: "image/avif",
    svg: "image/svg+xml",
    ico: "image/x-icon",
    tif: "image/tiff",
    tiff: "image/tiff",
    heic: "image/heic",
    heif: "image/heif"
  };

  const DOC_EXT = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    doc: "application/msword",
    txt: "text/plain",
    html: "text/html",
    htm: "text/html"
  };

  const EXT_FOR_MIME = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/bmp": "bmp",
    "image/avif": "avif",
    "image/heic": "heic",
    "image/heif": "heif",
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/msword": "doc",
    "text/plain": "txt",
    "text/html": "html"
  };

  function normalizeMime(m) {
    if (!m) return "";
    return String(m).split(";")[0].trim().toLowerCase();
  }

  function extFromName(name) {
    if (!name || !name.includes(".")) return "";
    return name.split(".").pop().toLowerCase();
  }

  function mimeFromExt(ext) {
    return IMAGE_EXT[ext] || DOC_EXT[ext] || "";
  }

  function mimeFromFile(file) {
    const t = normalizeMime(file && file.type);
    if (t && t !== "application/octet-stream") return t;
    return mimeFromExt(extFromName(file && file.name));
  }

  function extForMime(mime) {
    const m = normalizeMime(mime);
    if (EXT_FOR_MIME[m]) return EXT_FOR_MIME[m];
    if (m.startsWith("image/")) return m.slice(6).replace("jpeg", "jpg");
    return "bin";
  }

  function parseAccept(accept) {
    const raw = (accept || "").trim();
    const mimes = [];
    const exts = [];
    if (!raw) return { mimes, exts, raw };

    for (const part of raw.split(",")) {
      const token = part.trim().toLowerCase();
      if (!token) continue;
      if (token.startsWith(".")) {
        const ext = token.slice(1);
        exts.push(ext);
        const mime = mimeFromExt(ext);
        if (mime) mimes.push(mime);
      } else if (token.endsWith("/*")) {
        mimes.push(token);
      } else if (token.includes("/")) {
        mimes.push(normalizeMime(token));
      } else {
        exts.push(token);
        const mime = mimeFromExt(token);
        if (mime) mimes.push(mime);
      }
    }
    return { mimes: [...new Set(mimes)], exts: [...new Set(exts)], raw };
  }

  function mimeMatchesAccept(mime, acceptInfo) {
    const m = normalizeMime(mime);
    if (!acceptInfo.mimes.length && !acceptInfo.exts.length) return true;
    for (const a of acceptInfo.mimes) {
      if (a.endsWith("/*")) {
        if (m.startsWith(a.slice(0, -1))) return true;
      } else if (m === a) {
        return true;
      }
    }
    const ext = extForMime(m);
    if (acceptInfo.exts.includes(ext)) return true;
    if (ext === "jpg" && acceptInfo.exts.includes("jpeg")) return true;
    if (ext === "jpeg" && acceptInfo.exts.includes("jpg")) return true;
    if (ext === "heic" && acceptInfo.exts.includes("heif")) return true;
    if (ext === "heif" && acceptInfo.exts.includes("heic")) return true;
    return false;
  }

  function pickPreferredImage(imageTargets, preferredImageFormat) {
    if (preferredImageFormat && preferredImageFormat !== "auto") {
      const pref = normalizeMime(
        preferredImageFormat.includes("/")
          ? preferredImageFormat
          : `image/${preferredImageFormat === "jpg" ? "jpeg" : preferredImageFormat}`
      );
      if (imageTargets.includes(pref)) return pref;
    }
    if (imageTargets.includes("image/png")) return "image/png";
    return imageTargets[0];
  }

  /**
   * Pick the best target MIME for a file given accept constraints.
   * Returns null if no conversion needed / possible.
   */
  function inferTargetMime(file, acceptAttr, preferredImageFormat) {
    const acceptInfo = parseAccept(acceptAttr);
    const sourceMime = mimeFromFile(file);

    if (!acceptInfo.mimes.length && !acceptInfo.exts.length) {
      return null;
    }

    if (mimeMatchesAccept(sourceMime, acceptInfo)) {
      return null;
    }

    const concrete = acceptInfo.mimes.filter((m) => !m.endsWith("/*"));
    const imageTargets = concrete.filter((m) => m.startsWith("image/"));
    const isHeic =
      sourceMime === "image/heic" ||
      sourceMime === "image/heif" ||
      sourceMime === "image/heic-sequence";
    const isPdf = sourceMime === "application/pdf";
    const isDocx =
      sourceMime ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      sourceMime === "application/msword";

    // HEIC / PDF page → preferred raster when field wants images
    if ((isHeic || isPdf) && imageTargets.length) {
      return pickPreferredImage(imageTargets, preferredImageFormat);
    }
    if ((isHeic || isPdf) && acceptInfo.exts.some((e) => IMAGE_EXT[e])) {
      for (const ext of ["png", "jpg", "jpeg", "webp"]) {
        if (acceptInfo.exts.includes(ext)) return mimeFromExt(ext === "jpeg" ? "jpg" : ext);
      }
      for (const ext of acceptInfo.exts) {
        if (IMAGE_EXT[ext]) return IMAGE_EXT[ext];
      }
    }
    if ((isHeic || isPdf) && acceptInfo.mimes.some((m) => m === "image/*")) {
      return pickPreferredImage(["image/png", "image/jpeg"], preferredImageFormat);
    }

    // DOCX → text / html / pdf
    if (isDocx) {
      if (concrete.includes("application/pdf") || acceptInfo.exts.includes("pdf")) {
        return "application/pdf";
      }
      if (concrete.includes("text/html") || acceptInfo.exts.includes("html") || acceptInfo.exts.includes("htm")) {
        return "text/html";
      }
      if (concrete.includes("text/plain") || acceptInfo.exts.includes("txt")) {
        return "text/plain";
      }
      if (acceptInfo.mimes.some((m) => m === "text/*")) return "text/plain";
    }

    // Raster images → PDF when field wants PDF
    if (
      sourceMime.startsWith("image/") &&
      sourceMime !== "image/svg+xml" &&
      !isHeic &&
      (concrete.includes("application/pdf") || acceptInfo.exts.includes("pdf"))
    ) {
      return "application/pdf";
    }

    if (imageTargets.length && sourceMime.startsWith("image/")) {
      return pickPreferredImage(imageTargets, preferredImageFormat);
    }

    // Extension-only accept (e.g. ".png")
    if (acceptInfo.exts.length) {
      for (const ext of acceptInfo.exts) {
        const mime = mimeFromExt(ext);
        if (mime) {
          if (preferredImageFormat && preferredImageFormat !== "auto" && IMAGE_EXT[ext]) {
            const prefExt =
              preferredImageFormat === "jpeg" ? "jpg" : preferredImageFormat;
            if (acceptInfo.exts.includes(prefExt) || acceptInfo.exts.includes(preferredImageFormat)) {
              return mimeFromExt(prefExt) || mime;
            }
          }
          if (ext === "png") return "image/png";
          return mime;
        }
      }
    }

    if (acceptInfo.mimes.some((m) => m === "image/*") && sourceMime.startsWith("image/")) {
      return null;
    }

    if (concrete.length) return concrete[0];
    return null;
  }

  function renameWithExt(name, mime) {
    const base = (name || "file").replace(/\.[^.]+$/, "") || "file";
    return `${base}.${extForMime(mime)}`;
  }

  const api = {
    normalizeMime,
    extFromName,
    mimeFromExt,
    mimeFromFile,
    extForMime,
    parseAccept,
    mimeMatchesAccept,
    inferTargetMime,
    renameWithExt,
    IMAGE_EXT,
    DOC_EXT
  };

  root.SwiftConvertMime = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : self);
