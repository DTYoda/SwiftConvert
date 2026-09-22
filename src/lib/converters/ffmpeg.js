/**
 * Audio / video conversion via ffmpeg.wasm (convert host only).
 * Lazy-loads packaged UMD core + worker (no blob: / unsafe-eval).
 */
(function (root) {
  const Mime = root.SwiftConvertMime;

  let ffmpegInstance = null;
  let loadPromise = null;
  let loadAttempted = false;

  const AUDIO_IN = new Set([
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
  ]);
  const VIDEO_IN = new Set([
    "video/mp4",
    "video/webm",
    "video/ogg",
    "video/quicktime",
    "video/x-matroska",
    "video/avi"
  ]);
  const AUDIO_OUT = new Set([
    "audio/mpeg",
    "audio/wav",
    "audio/ogg",
    "audio/mp4",
    "audio/aac",
    "audio/flac"
  ]);
  const VIDEO_OUT = new Set(["video/mp4", "video/webm"]);

  function alias(m) {
    const n = Mime ? Mime.normalizeMime(m) : String(m || "").toLowerCase();
    if (n === "audio/mp3") return "audio/mpeg";
    if (n === "audio/x-wav" || n === "audio/wave") return "audio/wav";
    if (n === "audio/x-m4a" || n === "audio/m4a") return "audio/mp4";
    return n;
  }

  function isAudio(m) {
    return AUDIO_IN.has(alias(m)) || alias(m).startsWith("audio/");
  }
  function isVideo(m) {
    return VIDEO_IN.has(alias(m)) || alias(m).startsWith("video/");
  }

  function extForTarget(target) {
    const t = alias(target);
    const map = {
      "audio/mpeg": "mp3",
      "audio/wav": "wav",
      "audio/ogg": "ogg",
      "audio/mp4": "m4a",
      "audio/aac": "aac",
      "audio/flac": "flac",
      "video/mp4": "mp4",
      "video/webm": "webm"
    };
    return map[t] || "bin";
  }

  function inputName(file) {
    const mime = alias(Mime.mimeFromFile(file));
    const ext =
      (Mime && Mime.extForMime && Mime.extForMime(mime)) ||
      String(file.name || "").split(".").pop() ||
      "bin";
    return "input." + ext;
  }

  function vendorUrl(path) {
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL) {
      return chrome.runtime.getURL(path);
    }
    // Demo / self-test served from repo root
    return "/" + path;
  }

  function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      if (root.FFmpegWASM && root.FFmpegWASM.FFmpeg) {
        resolve();
        return;
      }
      const existing = document.querySelector('script[data-swiftconvert-ffmpeg]');
      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error("ffmpeg.js failed")));
        return;
      }
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.dataset.swiftconvertFfmpeg = "1";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Failed to load ffmpeg.js"));
      document.head.appendChild(s);
    });
  }

  async function ensureFfmpeg(onProgress) {
    if (ffmpegInstance && ffmpegInstance.loaded) return ffmpegInstance;
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
      loadAttempted = true;
      if (typeof onProgress === "function") {
        onProgress({ phase: "load", message: "Loading FFmpeg (first time can be slow)…" });
      }
      await loadScriptOnce(vendorUrl("src/lib/vendor/ffmpeg/ffmpeg.js"));
      const FFmpegClass =
        (root.FFmpegWASM && root.FFmpegWASM.FFmpeg) ||
        (root.FFmpeg && root.FFmpeg.FFmpeg) ||
        root.FFmpeg;
      if (!FFmpegClass) throw new Error("FFmpeg WASM wrapper missing");

      const ffmpeg = new FFmpegClass();
      ffmpeg.on("log", ({ message }) => {
        if (message && /error|fail/i.test(message)) {
          console.warn("[SwiftConvert ffmpeg]", message);
        }
      });
      if (typeof onProgress === "function") {
        ffmpeg.on("progress", ({ progress }) => {
          onProgress({
            phase: "run",
            message: "Encoding… " + Math.round((progress || 0) * 100) + "%"
          });
        });
      }

      const coreURL = vendorUrl("src/lib/vendor/ffmpeg/ffmpeg-core.js");
      const wasmURL = vendorUrl("src/lib/vendor/ffmpeg/ffmpeg-core.wasm");
      // UMD build resolves packaged worker 814.ffmpeg.js next to ffmpeg.js (worker-src 'self')
      await ffmpeg.load({ coreURL, wasmURL });
      ffmpegInstance = ffmpeg;
      return ffmpeg;
    })().catch((err) => {
      loadPromise = null;
      throw err;
    });

    return loadPromise;
  }

  function buildArgs(srcMime, targetMime, inName, outName) {
    const src = alias(srcMime);
    const tgt = alias(targetMime);
    const args = ["-i", inName];

    // Audio → video with black frames
    if (isAudio(src) && isVideo(tgt)) {
      args.length = 0;
      args.push(
        "-f",
        "lavfi",
        "-i",
        "color=c=black:s=1280x720:r=30",
        "-i",
        inName,
        "-shortest",
        "-c:v",
        tgt === "video/webm" ? "libvpx" : "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        tgt === "video/webm" ? "libvorbis" : "aac",
        "-b:v",
        "1M"
      );
      if (tgt === "video/mp4") {
        args.push("-movflags", "+faststart");
      }
      args.push("-y", outName);
      return args;
    }

    // Video → audio
    if (isVideo(src) && isAudio(tgt)) {
      args.push("-vn");
    }

    // Codec / container hints
    if (tgt === "audio/mpeg") {
      args.push("-c:a", "libmp3lame", "-q:a", "2");
    } else if (tgt === "audio/wav") {
      args.push("-c:a", "pcm_s16le");
    } else if (tgt === "audio/ogg") {
      args.push("-c:a", "libvorbis", "-q:a", "5");
    } else if (tgt === "audio/mp4" || tgt === "audio/aac") {
      args.push("-c:a", "aac", "-b:a", "192k");
    } else if (tgt === "audio/flac") {
      args.push("-c:a", "flac");
    } else if (tgt === "video/mp4") {
      args.push("-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "-movflags", "+faststart");
    } else if (tgt === "video/webm") {
      args.push("-c:v", "libvpx", "-b:v", "1M", "-c:a", "libvorbis");
    }

    args.push("-y", outName);
    return args;
  }

  async function convert(file, targetMime, options) {
    const target = alias(targetMime);
    const src = alias(Mime.mimeFromFile(file));
    if (!canConvert(file, target)) {
      throw new Error(`No ffmpeg path for ${src} → ${target}`);
    }

    const ffmpeg = await ensureFfmpeg(options && options.onProgress);
    const inName = inputName(file);
    const outExt = extForTarget(target);
    const outName = "output." + outExt;

    const data = new Uint8Array(await file.arrayBuffer());
    await ffmpeg.writeFile(inName, data);

    const args = buildArgs(src, target, inName, outName);
    // Remove accidental duplicate -y placement: ensure last is outfile
    const code = await ffmpeg.exec(args);
    if (code !== 0) {
      // Retry audio→video with mpeg4 if libx264 missing
      if (isAudio(src) && target === "video/mp4") {
        await ffmpeg.deleteFile(outName).catch(() => {});
        const retry = [
          "-f",
          "lavfi",
          "-i",
          "color=c=black:s=640x360:r=25",
          "-i",
          inName,
          "-shortest",
          "-c:v",
          "mpeg4",
          "-c:a",
          "aac",
          "-y",
          outName
        ];
        const code2 = await ffmpeg.exec(retry);
        if (code2 !== 0) {
          throw new Error("ffmpeg exited with code " + code2);
        }
      } else {
        throw new Error("ffmpeg exited with code " + code);
      }
    }

    const outData = await ffmpeg.readFile(outName);
    try {
      await ffmpeg.deleteFile(inName);
    } catch (_) {
      /* ignore */
    }
    try {
      await ffmpeg.deleteFile(outName);
    } catch (_) {
      /* ignore */
    }

    const bytes = outData instanceof Uint8Array ? outData : new Uint8Array(outData);
    const name = Mime.renameWithExt(file.name, target);
    return new File([bytes], name, { type: target, lastModified: Date.now() });
  }

  function canConvert(file, targetMime) {
    const src = alias(Mime.mimeFromFile(file));
    const tgt = alias(targetMime);
    if (!src || !tgt || src === tgt) return false;
    if (isAudio(src) && AUDIO_OUT.has(tgt)) return true;
    if (isVideo(src) && AUDIO_OUT.has(tgt)) return true;
    if (isAudio(src) && VIDEO_OUT.has(tgt)) return true;
    if (isVideo(src) && VIDEO_OUT.has(tgt)) return true;
    return false;
  }

  root.SwiftConvertFfmpeg = {
    convert,
    canConvert,
    ensureFfmpeg,
    isAudioFile: (f) => isAudio(Mime.mimeFromFile(f)),
    isVideoFile: (f) => isVideo(Mime.mimeFromFile(f)),
    wasLoadAttempted: () => loadAttempted
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
