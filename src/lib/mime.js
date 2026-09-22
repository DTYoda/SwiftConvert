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
    htm: "text/html",
    csv: "text/csv"
  };

  const AUDIO_EXT = {
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    oga: "audio/ogg",
    m4a: "audio/mp4",
    aac: "audio/aac",
    flac: "audio/flac",
    weba: "audio/webm"
  };

  const VIDEO_EXT = {
    mp4: "video/mp4",
    webm: "video/webm",
    ogv: "video/ogg",
    mov: "video/quicktime",
    mkv: "video/x-matroska",
    avi: "video/avi"
  };

  const OFFICE_EXT = {
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  };

  const EXT_FOR_MIME = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/bmp": "bmp",
    "image/avif": "avif",
    "image/svg+xml": "svg",
    "image/heic": "heic",
    "image/heif": "heif",
    "application/pdf": "pdf",
    "application/zip": "zip",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "text/plain": "txt",
    "text/html": "html",
    "text/csv": "csv",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
    "audio/aac": "aac",
    "audio/flac": "flac",
    "audio/webm": "weba",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/ogg": "ogv",
    "video/quicktime": "mov"
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
    return (
      IMAGE_EXT[ext] ||
      DOC_EXT[ext] ||
      AUDIO_EXT[ext] ||
      VIDEO_EXT[ext] ||
      OFFICE_EXT[ext] ||
      ""
    );
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
    if (m.startsWith("audio/")) return m.slice(6).replace("mpeg", "mp3");
    if (m.startsWith("video/")) return m.slice(6);
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
    if (ext === "mp3" && acceptInfo.exts.includes("mpeg")) return true;
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

  function pickPreferredAudio(audioTargets) {
    if (audioTargets.includes("audio/mpeg")) return "audio/mpeg";
    if (audioTargets.includes("audio/wav")) return "audio/wav";
    return audioTargets[0];
  }

  function pickPreferredVideo(videoTargets) {
    if (videoTargets.includes("video/mp4")) return "video/mp4";
    if (videoTargets.includes("video/webm")) return "video/webm";
    return videoTargets[0];
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
    const audioTargets = concrete.filter((m) => m.startsWith("audio/"));
    const videoTargets = concrete.filter((m) => m.startsWith("video/"));
    const isHeic =
      sourceMime === "image/heic" ||
      sourceMime === "image/heif" ||
      sourceMime === "image/heic-sequence";
    const isPdf = sourceMime === "application/pdf";
    const isDocx =
      sourceMime ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      sourceMime === "application/msword";
    const isPptx =
      sourceMime ===
      "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    const isXlsx =
      sourceMime ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const isAudio = sourceMime.startsWith("audio/");
    const isVideo = sourceMime.startsWith("video/");
    const isTextish =
      sourceMime === "text/plain" ||
      sourceMime === "text/html" ||
      sourceMime === "text/csv" ||
      sourceMime === "application/csv";
    const isSvg = sourceMime === "image/svg+xml";

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

    // HEIC → PDF
    if (isHeic && (concrete.includes("application/pdf") || acceptInfo.exts.includes("pdf"))) {
      return "application/pdf";
    }

    // PDF → text
    if (isPdf && (concrete.includes("text/plain") || acceptInfo.exts.includes("txt"))) {
      return "text/plain";
    }
    if (isPdf && acceptInfo.mimes.some((m) => m === "text/*")) return "text/plain";

    // DOCX → images / pdf / text / html
    if (isDocx) {
      if (imageTargets.length) {
        return pickPreferredImage(imageTargets, preferredImageFormat);
      }
      if (acceptInfo.exts.some((e) => IMAGE_EXT[e])) {
        for (const ext of ["png", "jpg", "jpeg", "webp"]) {
          if (acceptInfo.exts.includes(ext)) return mimeFromExt(ext === "jpeg" ? "jpg" : ext);
        }
      }
      if (acceptInfo.mimes.some((m) => m === "image/*")) {
        return pickPreferredImage(["image/png", "image/jpeg"], preferredImageFormat);
      }
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

    // PPTX / XLSX
    if (isPptx || isXlsx) {
      if (concrete.includes("application/pdf") || acceptInfo.exts.includes("pdf")) {
        return "application/pdf";
      }
      if (concrete.includes("text/html") || acceptInfo.exts.includes("html")) {
        return "text/html";
      }
      if (isXlsx && (concrete.includes("text/csv") || acceptInfo.exts.includes("csv"))) {
        return "text/csv";
      }
      if (concrete.includes("text/plain") || acceptInfo.exts.includes("txt")) {
        return "text/plain";
      }
    }

    // Text / HTML / CSV → PDF
    if (isTextish && (concrete.includes("application/pdf") || acceptInfo.exts.includes("pdf"))) {
      return "application/pdf";
    }
    if (sourceMime === "text/html" && (concrete.includes("text/plain") || acceptInfo.exts.includes("txt"))) {
      return "text/plain";
    }
    if (
      (sourceMime === "text/csv" || sourceMime === "application/csv") &&
      (concrete.includes("text/plain") || acceptInfo.exts.includes("txt"))
    ) {
      return "text/plain";
    }

    // SVG → raster
    if (isSvg && imageTargets.length) {
      return pickPreferredImage(imageTargets, preferredImageFormat);
    }
    if (isSvg && acceptInfo.mimes.some((m) => m === "image/*")) {
      return pickPreferredImage(["image/png", "image/jpeg"], preferredImageFormat);
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

    // Audio / video
    if (isAudio || isVideo) {
      if (audioTargets.length) return pickPreferredAudio(audioTargets);
      if (videoTargets.length) return pickPreferredVideo(videoTargets);
      if (acceptInfo.mimes.some((m) => m === "audio/*")) {
        return pickPreferredAudio(["audio/mpeg", "audio/wav"]);
      }
      if (acceptInfo.mimes.some((m) => m === "video/*")) {
        return pickPreferredVideo(["video/mp4", "video/webm"]);
      }
      for (const ext of acceptInfo.exts) {
        if (AUDIO_EXT[ext]) return AUDIO_EXT[ext];
        if (VIDEO_EXT[ext]) return VIDEO_EXT[ext];
      }
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

  /** Known upload source types SwiftConvert may offer in the OS file picker. */
  const PICKER_SOURCE_CATALOG = (() => {
    const seen = new Set();
    const out = [];
    function add(ext, mime) {
      const m = normalizeMime(mime);
      const e = ext === "jpeg" ? "jpg" : ext;
      const key = m + "|" + e;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ ext: e, mime: m });
    }
    for (const [ext, mime] of Object.entries(IMAGE_EXT)) add(ext, mime);
    for (const [ext, mime] of Object.entries(DOC_EXT)) add(ext, mime);
    for (const [ext, mime] of Object.entries(AUDIO_EXT)) add(ext, mime);
    for (const [ext, mime] of Object.entries(VIDEO_EXT)) add(ext, mime);
    for (const [ext, mime] of Object.entries(OFFICE_EXT)) add(ext, mime);
    add("pdf", "application/pdf");
    return out;
  })();

  function acceptTokenForExt(ext) {
    const tokens = [];
    if (ext) tokens.push("." + ext);
    if (ext === "jpg") tokens.push(".jpeg");
    if (ext === "jpeg") tokens.push(".jpg");
    if (ext === "heic") tokens.push(".heif");
    if (ext === "heif") tokens.push(".heic");
    return tokens;
  }

  function acceptTokenForMime(mime) {
    const m = normalizeMime(mime);
    if (!m) return [];
    const tokens = [m];
    if (m === "image/jpeg") tokens.push("image/jpg");
    if (m === "audio/mpeg") tokens.push("audio/mp3");
    return tokens;
  }

  /**
   * Build a file-input accept string that includes native site constraints plus
   * every source type SwiftConvert can convert into an accepted target.
   * @param {string} acceptAttr
   * @param {string} [preferredImageFormat]
   * @param {(file: File, targetMime: string) => boolean} [canHandle]
   */
  function buildExpandedAccept(acceptAttr, preferredImageFormat, canHandle) {
    const acceptInfo = parseAccept(acceptAttr);
    const tokens = new Set();

    if (acceptInfo.raw) {
      for (const part of acceptInfo.raw.split(",")) {
        const t = part.trim();
        if (t) tokens.add(t);
      }
    }

    // No stated target — keep native behavior (empty = unrestricted; do not widen).
    if (!acceptInfo.mimes.length && !acceptInfo.exts.length) {
      return acceptInfo.raw || "";
    }

    const catalog =
      root.SwiftConvertCatalog && root.SwiftConvertCatalog.pickerSources
        ? root.SwiftConvertCatalog.pickerSources()
        : PICKER_SOURCE_CATALOG;

    for (const { ext, mime } of catalog) {
      if (mimeMatchesAccept(mime, acceptInfo)) continue;

      const probe = new File([], `probe.${ext}`, { type: mime });
      const target = inferTargetMime(probe, acceptAttr, preferredImageFormat);
      if (!target) continue;
      if (typeof canHandle === "function" && !canHandle(probe, target)) continue;

      for (const t of acceptTokenForMime(mime)) tokens.add(t);
      for (const t of acceptTokenForExt(ext)) tokens.add(t);
    }

    return [...tokens].join(",");
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
    buildExpandedAccept,
    IMAGE_EXT,
    DOC_EXT,
    AUDIO_EXT,
    VIDEO_EXT,
    OFFICE_EXT,
    PICKER_SOURCE_CATALOG
  };

  root.SwiftConvertMime = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : self);
