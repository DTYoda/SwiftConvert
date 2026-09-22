/**
 * Explicit conversion edge catalog.
 * Used by registry (canHandle / chaining), Tools format lists, and mime accept expansion.
 */
(function (root) {
  const Mime = root.SwiftConvertMime;

  /** @typedef {{ id: string, sources: string[], targets: string[], engine: string, needsHost: boolean, label?: string, chainOnly?: boolean }} Edge */

  /** Direct conversion edges (not transitive). */
  const EDGES /** @type {Edge[]} */ = [
    // Canvas raster (in-page)
    {
      id: "image-raster",
      sources: [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
        "image/bmp",
        "image/avif",
        "image/tiff",
        "image/x-icon"
      ],
      targets: ["image/jpeg", "image/png", "image/webp", "image/gif"],
      engine: "canvas",
      needsHost: false,
      label: "Raster image"
    },
    {
      id: "svg-raster",
      sources: ["image/svg+xml"],
      targets: ["image/png", "image/jpeg", "image/webp"],
      engine: "svg",
      needsHost: false,
      label: "SVG → raster"
    },
    {
      id: "image-pdf",
      sources: [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
        "image/bmp",
        "image/avif"
      ],
      targets: ["application/pdf"],
      engine: "pdf-write",
      needsHost: false,
      label: "Image → PDF"
    },
    // HEIC (host)
    {
      id: "heic-raster",
      sources: ["image/heic", "image/heif", "image/heic-sequence"],
      targets: ["image/jpeg", "image/png", "image/webp", "image/gif"],
      engine: "heic",
      needsHost: true,
      label: "HEIC → raster"
    },
    // PDF (host)
    {
      id: "pdf-image",
      sources: ["application/pdf"],
      targets: ["image/png", "image/jpeg", "image/webp"],
      engine: "pdf",
      needsHost: true,
      label: "PDF → image (page 1)"
    },
    {
      id: "pdf-images-zip",
      sources: ["application/pdf"],
      targets: ["application/zip"],
      engine: "pdf-multipage",
      needsHost: true,
      label: "PDF → ZIP of page images"
    },
    {
      id: "pdf-text",
      sources: ["application/pdf"],
      targets: ["text/plain"],
      engine: "pdf-text",
      needsHost: true,
      label: "PDF → text"
    },
    // DOCX (host)
    {
      id: "docx-text",
      sources: [
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ],
      targets: ["text/plain", "text/html"],
      engine: "docx",
      needsHost: true,
      label: "DOCX → text/HTML"
    },
    {
      id: "docx-visual-image",
      sources: [
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ],
      targets: ["image/png", "image/jpeg", "image/webp"],
      engine: "docx-visual",
      needsHost: true,
      label: "DOCX → image (HTML visual)"
    },
    {
      id: "docx-visual-pdf",
      sources: [
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ],
      targets: ["application/pdf"],
      engine: "docx-visual",
      needsHost: true,
      label: "DOCX → PDF (layout best-effort)"
    },
    // Text / HTML / CSV
    {
      id: "text-pdf",
      sources: ["text/plain", "text/html", "text/csv", "application/csv"],
      targets: ["application/pdf"],
      engine: "text",
      needsHost: false,
      label: "Text/HTML/CSV → PDF"
    },
    {
      id: "html-text",
      sources: ["text/html"],
      targets: ["text/plain"],
      engine: "text",
      needsHost: false,
      label: "HTML → text"
    },
    {
      id: "csv-text",
      sources: ["text/csv", "application/csv"],
      targets: ["text/plain"],
      engine: "text",
      needsHost: false,
      label: "CSV → text"
    },
    // Office best-effort
    {
      id: "pptx-html",
      sources: [
        "application/vnd.openxmlformats-officedocument.presentationml.presentation"
      ],
      targets: ["text/html", "text/plain", "application/pdf"],
      engine: "office",
      needsHost: true,
      label: "PPTX → HTML/text/PDF (best-effort)"
    },
    {
      id: "xlsx-csv",
      sources: [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      ],
      targets: ["text/csv", "text/plain", "text/html", "application/pdf"],
      engine: "office",
      needsHost: true,
      label: "XLSX → CSV/HTML/PDF (best-effort)"
    },
    // Audio / video via ffmpeg (host)
    {
      id: "audio-audio",
      sources: [
        "audio/mpeg",
        "audio/mp3",
        "audio/wav",
        "audio/x-wav",
        "audio/wave",
        "audio/ogg",
        "audio/webm",
        "audio/mp4",
        "audio/aac",
        "audio/flac",
        "audio/x-m4a",
        "audio/m4a"
      ],
      targets: [
        "audio/mpeg",
        "audio/wav",
        "audio/ogg",
        "audio/mp4",
        "audio/aac",
        "audio/flac"
      ],
      engine: "ffmpeg",
      needsHost: true,
      label: "Audio → audio"
    },
    {
      id: "video-audio",
      sources: [
        "video/mp4",
        "video/webm",
        "video/ogg",
        "video/quicktime",
        "video/x-matroska",
        "video/avi"
      ],
      targets: [
        "audio/mpeg",
        "audio/wav",
        "audio/ogg",
        "audio/mp4",
        "audio/aac",
        "audio/flac"
      ],
      engine: "ffmpeg",
      needsHost: true,
      label: "Video → audio"
    },
    {
      id: "audio-video",
      sources: [
        "audio/mpeg",
        "audio/mp3",
        "audio/wav",
        "audio/x-wav",
        "audio/ogg",
        "audio/webm",
        "audio/mp4",
        "audio/aac",
        "audio/flac",
        "audio/x-m4a",
        "audio/m4a"
      ],
      targets: ["video/mp4", "video/webm"],
      engine: "ffmpeg",
      needsHost: true,
      label: "Audio → video (black frames)"
    },
    {
      id: "video-video",
      sources: [
        "video/mp4",
        "video/webm",
        "video/ogg",
        "video/quicktime",
        "video/x-matroska",
        "video/avi"
      ],
      targets: ["video/mp4", "video/webm"],
      engine: "ffmpeg",
      needsHost: true,
      label: "Video → video"
    }
  ];

  function normalize(m) {
    return Mime ? Mime.normalizeMime(m) : String(m || "").split(";")[0].trim().toLowerCase();
  }

  function aliasMime(m) {
    const n = normalize(m);
    if (n === "audio/mp3") return "audio/mpeg";
    if (n === "audio/x-wav" || n === "audio/wave") return "audio/wav";
    if (n === "audio/x-m4a" || n === "audio/m4a") return "audio/mp4";
    if (n === "application/csv") return "text/csv";
    return n;
  }

  function listEdges() {
    return EDGES.slice();
  }

  function directTargets(sourceMime) {
    const src = aliasMime(sourceMime);
    const out = new Set();
    for (const edge of EDGES) {
      const sources = edge.sources.map(aliasMime);
      if (!sources.includes(src)) continue;
      for (const t of edge.targets) out.add(aliasMime(t));
    }
    out.delete(src);
    return [...out];
  }

  function edgeNeedsHost(sourceMime, targetMime) {
    const src = aliasMime(sourceMime);
    const tgt = aliasMime(targetMime);
    for (const edge of EDGES) {
      if (edge.sources.map(aliasMime).includes(src) && edge.targets.map(aliasMime).includes(tgt)) {
        return Boolean(edge.needsHost);
      }
    }
    return false;
  }

  function findDirectEdge(sourceMime, targetMime) {
    const src = aliasMime(sourceMime);
    const tgt = aliasMime(targetMime);
    for (const edge of EDGES) {
      if (edge.sources.map(aliasMime).includes(src) && edge.targets.map(aliasMime).includes(tgt)) {
        return edge;
      }
    }
    return null;
  }

  /**
   * Shortest path of MIME hops (BFS). Returns [src, ..., target] or null.
   * Max depth 3 to keep chains practical (e.g. HEIC→JPEG→PDF, DOCX→PNG is direct).
   */
  function shortestPath(sourceMime, targetMime, maxDepth) {
    const src = aliasMime(sourceMime);
    const tgt = aliasMime(targetMime);
    if (!src || !tgt) return null;
    if (src === tgt) return [src];
    const limit = typeof maxDepth === "number" ? maxDepth : 3;
    const queue = [[src]];
    const seen = new Set([src]);
    while (queue.length) {
      const path = queue.shift();
      const last = path[path.length - 1];
      if (path.length - 1 >= limit) continue;
      for (const next of directTargets(last)) {
        if (seen.has(next)) continue;
        const nextPath = path.concat(next);
        if (next === tgt) return nextPath;
        seen.add(next);
        queue.push(nextPath);
      }
    }
    return null;
  }

  function canReach(sourceMime, targetMime) {
    return Boolean(shortestPath(sourceMime, targetMime));
  }

  function allReachableTargets(sourceMime) {
    const src = aliasMime(sourceMime);
    const out = new Set();
    const queue = [src];
    const seen = new Set([src]);
    let depth = 0;
    let layerSize = 1;
    while (queue.length && depth < 3) {
      const cur = queue.shift();
      layerSize -= 1;
      for (const next of directTargets(cur)) {
        if (seen.has(next)) continue;
        seen.add(next);
        out.add(next);
        queue.push(next);
      }
      if (layerSize === 0) {
        depth += 1;
        layerSize = queue.length;
      }
    }
    return [...out];
  }

  function toolsOptions(sourceMime) {
    const src = aliasMime(sourceMime);
    const targets = allReachableTargets(src);
    const labels = {
      "image/jpeg": "JPEG",
      "image/png": "PNG",
      "image/webp": "WebP",
      "image/gif": "GIF",
      "application/pdf": "PDF",
      "application/zip": "ZIP (PDF pages)",
      "text/plain": "Plain text",
      "text/html": "HTML",
      "text/csv": "CSV",
      "audio/mpeg": "MP3",
      "audio/wav": "WAV",
      "audio/ogg": "OGG",
      "audio/mp4": "M4A",
      "audio/aac": "AAC",
      "audio/flac": "FLAC",
      "video/mp4": "MP4",
      "video/webm": "WebM"
    };
    // Prefer friendly ordering
    const prefer = [
      "image/png",
      "image/jpeg",
      "image/webp",
      "application/pdf",
      "text/plain",
      "text/html",
      "text/csv",
      "application/zip",
      "audio/mpeg",
      "audio/wav",
      "audio/ogg",
      "audio/mp4",
      "audio/aac",
      "audio/flac",
      "video/mp4",
      "video/webm"
    ];
    const ordered = prefer.filter((t) => targets.includes(t));
    for (const t of targets) {
      if (!ordered.includes(t)) ordered.push(t);
    }

    // Annotate DOCX PDF as visual; text PDF path is same mime — label via engine
    return ordered.map((t) => {
      let label = labels[t] || t;
      if (
        src ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document" &&
        t === "application/pdf"
      ) {
        label = "PDF (layout best-effort)";
      }
      if (src === "application/pdf" && t.startsWith("image/")) {
        label = labels[t] + " (page 1)";
      }
      if (
        (src.startsWith("audio/") || src.startsWith("video/")) &&
        t.startsWith("video/") &&
        src.startsWith("audio/")
      ) {
        label = labels[t] + " (black frames)";
      }
      return [t, label];
    });
  }

  /** Source types for OS picker expansion. */
  function pickerSources() {
    const seen = new Set();
    const out = [];
    function add(ext, mime) {
      const m = aliasMime(mime);
      const e = ext === "jpeg" ? "jpg" : ext;
      const key = m + "|" + e;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ ext: e, mime: m });
    }
    if (Mime) {
      for (const [ext, mime] of Object.entries(Mime.IMAGE_EXT || {})) add(ext, mime);
      for (const [ext, mime] of Object.entries(Mime.DOC_EXT || {})) add(ext, mime);
      for (const [ext, mime] of Object.entries(Mime.AUDIO_EXT || {})) add(ext, mime);
      for (const [ext, mime] of Object.entries(Mime.VIDEO_EXT || {})) add(ext, mime);
      for (const [ext, mime] of Object.entries(Mime.OFFICE_EXT || {})) add(ext, mime);
    }
    return out;
  }

  root.SwiftConvertCatalog = {
    EDGES,
    listEdges,
    directTargets,
    edgeNeedsHost,
    findDirectEdge,
    shortestPath,
    canReach,
    allReachableTargets,
    toolsOptions,
    pickerSources,
    aliasMime
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
