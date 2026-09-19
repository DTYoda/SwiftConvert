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
    tiff: "image/tiff"
  };

  const EXT_FOR_MIME = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/bmp": "bmp",
    "image/avif": "avif",
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/msword": "doc"
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
    return IMAGE_EXT[ext] || "";
  }

  function mimeFromFile(file) {
    const t = normalizeMime(file && file.type);
    if (t) return t;
    return mimeFromExt(extFromName(file && file.name));
  }

  function extForMime(mime) {
    const m = normalizeMime(mime);
    if (EXT_FOR_MIME[m]) return EXT_FOR_MIME[m];
    if (m.startsWith("image/")) return m.slice(6).replace("jpeg", "jpg");
    return "bin";
  }

  /**
   * Parse an accept attribute into concrete MIME types and extensions.
   * Returns { mimes: string[], exts: string[], raw: string }
   */
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
        // bare token like "png"
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
    // jpeg/jpg alias
    if (ext === "jpg" && acceptInfo.exts.includes("jpeg")) return true;
    if (ext === "jpeg" && acceptInfo.exts.includes("jpg")) return true;
    return false;
  }

  /**
   * Pick the best target MIME for a file given accept constraints.
   * Returns null if no conversion needed / possible.
   */
  function inferTargetMime(file, acceptAttr, preferredImageFormat) {
    const acceptInfo = parseAccept(acceptAttr);
    const sourceMime = mimeFromFile(file);

    if (!acceptInfo.mimes.length && !acceptInfo.exts.length) {
      return null; // nothing to enforce
    }

    if (mimeMatchesAccept(sourceMime, acceptInfo)) {
      return null; // already acceptable
    }

    // Prefer a concrete image target from accept list
    const concrete = acceptInfo.mimes.filter((m) => !m.endsWith("/*"));
    const imageTargets = concrete.filter((m) => m.startsWith("image/"));

    if (imageTargets.length) {
      if (preferredImageFormat && preferredImageFormat !== "auto") {
        const pref = normalizeMime(
          preferredImageFormat.includes("/")
            ? preferredImageFormat
            : `image/${preferredImageFormat === "jpg" ? "jpeg" : preferredImageFormat}`
        );
        if (imageTargets.includes(pref)) return pref;
      }
      // Prefer PNG when listed (lossless, widely accepted), else first
      if (imageTargets.includes("image/png")) return "image/png";
      return imageTargets[0];
    }

    // Extension-only accept (e.g. ".png")
    if (acceptInfo.exts.length) {
      for (const ext of acceptInfo.exts) {
        const mime = mimeFromExt(ext);
        if (mime) {
          if (preferredImageFormat && preferredImageFormat !== "auto") {
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

    // image/* wildcard but source is non-image — skip (can't invent pixels from PDF here)
    if (acceptInfo.mimes.some((m) => m === "image/*") && sourceMime.startsWith("image/")) {
      return null;
    }

    // Non-image targets (stubs later): return first concrete mime
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
    IMAGE_EXT
  };

  root.SwiftConvertMime = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : self);
