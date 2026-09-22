/**
 * Unified manual tools UI — pick/drop → Convert and/or Compress checkboxes
 * → Run (convert then compress) → before/after confirm → download / drag out.
 *
 * Expects classic scripts: SwiftConvertMime, SwiftConvertRegistry,
 * SwiftConvertCompress, SwiftConvertCompare. pdfjsLib when converting PDF → image.
 */
(function () {
  const Mime = globalThis.SwiftConvertMime;
  const Registry = globalThis.SwiftConvertRegistry;
  const Compress = globalThis.SwiftConvertCompress;
  const Compare = globalThis.SwiftConvertCompare;
  if (!Mime || !Registry || !Compress || !Compare) {
    console.warn("[SwiftConvert] tools UI missing libs");
    return;
  }

  const root = document.getElementById("manualTools");
  if (!root) return;

  const drop = root.querySelector("[data-tool-drop]");
  const fileInput = root.querySelector("[data-tool-file]");
  const nameEl = root.querySelector("[data-tool-name]");
  const doConvert = root.querySelector("[data-tool-do-convert]");
  const doCompress = root.querySelector("[data-tool-do-compress]");
  const convertOpts = root.querySelector("[data-tool-convert-opts]");
  const compressOpts = root.querySelector("[data-tool-compress-opts]");
  const formatSelect = root.querySelector("[data-tool-format]");
  const modeSelect = root.querySelector("[data-tool-cp-mode]");
  const targetKb = root.querySelector("[data-tool-target-kb]");
  const quality = root.querySelector("[data-tool-quality]");
  const maxW = root.querySelector("[data-tool-max-w]");
  const maxH = root.querySelector("[data-tool-max-h]");
  const runBtn = root.querySelector("[data-tool-run]");
  const downloadBtn = root.querySelector("[data-tool-download]");
  const dragHandle = root.querySelector("[data-tool-drag]");
  const statusEl = root.querySelector("[data-tool-status]");
  const openPanelBtn = root.querySelector("[data-tool-open-panel]");
  const confirmEl = root.querySelector("[data-tool-confirm]");
  const confirmMount = root.querySelector("[data-tool-confirm-mount]");
  const acceptBtn = root.querySelector("[data-tool-accept]");
  const cancelBtn = root.querySelector("[data-tool-cancel]");
  const sourcePreview = root.querySelector("[data-tool-source-preview]");

  /** @type {File | null} */
  let sourceFile = null;
  /** @type {File | null} */
  let resultFile = null;
  /** @type {File | null} */
  let pendingResult = null;
  /** @type {string | null} */
  let objectUrl = null;
  /** @type {string | null} */
  let sourcePreviewUrl = null;
  /** @type {string | null} */
  let confirmBeforeUrl = null;
  /** @type {string | null} */
  let confirmAfterUrl = null;

  function setStatus(text, kind) {
    if (!statusEl) return;
    statusEl.textContent = text || "";
    statusEl.dataset.kind = kind || "";
  }

  function revokeObjectUrl() {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
  }

  function revokeSourcePreview() {
    if (sourcePreviewUrl) {
      URL.revokeObjectURL(sourcePreviewUrl);
      sourcePreviewUrl = null;
    }
    if (sourcePreview) {
      sourcePreview.classList.remove("show");
      sourcePreview.innerHTML = "";
    }
  }

  function revokeConfirmUrls() {
    if (confirmBeforeUrl) {
      URL.revokeObjectURL(confirmBeforeUrl);
      confirmBeforeUrl = null;
    }
    if (confirmAfterUrl) {
      URL.revokeObjectURL(confirmAfterUrl);
      confirmAfterUrl = null;
    }
    if (Compare && confirmMount) Compare.destroy(confirmMount);
  }

  function clearResult() {
    resultFile = null;
    pendingResult = null;
    revokeObjectUrl();
    hideConfirm();
    if (downloadBtn) downloadBtn.disabled = true;
    if (dragHandle) {
      dragHandle.draggable = false;
      dragHandle.setAttribute("aria-disabled", "true");
      dragHandle.classList.remove("ready");
    }
  }

  function sourceKind(file) {
    const mime = Mime.mimeFromFile(file);
    if (mime === "image/heic" || mime === "image/heif") return "heic";
    if (mime === "application/pdf") return "pdf";
    if (
      mime ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      mime === "application/msword"
    ) {
      return "docx";
    }
    if (mime.startsWith("audio/")) return "audio";
    if (mime.startsWith("video/")) return "video";
    if (mime.startsWith("image/")) return "image";
    if (mime === "text/plain" || mime === "text/html" || mime === "text/csv") return "text";
    if (
      mime.includes("presentationml") ||
      mime.includes("spreadsheetml")
    ) {
      return "office";
    }
    return "other";
  }

  function isBrowserImage(mime) {
    return (
      Boolean(mime) &&
      mime.startsWith("image/") &&
      mime !== "image/heic" &&
      mime !== "image/heif" &&
      mime !== "image/svg+xml"
    );
  }

  function optionsFor(file) {
    if (Registry.targetsForFile) {
      const opts = Registry.targetsForFile(file);
      if (opts && opts.length) return opts;
    }
    return [
      ["image/png", "PNG"],
      ["image/jpeg", "JPEG"]
    ];
  }

  function refreshFormatOptions(file) {
    if (!formatSelect) return;
    const opts = optionsFor(file);
    const previous = formatSelect.value;
    formatSelect.innerHTML = "";
    for (const [value, label] of opts) {
      const o = document.createElement("option");
      o.value = value;
      o.textContent = label;
      formatSelect.appendChild(o);
    }
    if (opts.some(([v]) => v === previous)) formatSelect.value = previous;
  }

  function syncOpSections() {
    const convertOn = Boolean(doConvert && doConvert.checked);
    const compressOn = Boolean(doCompress && doCompress.checked);
    if (convertOpts) convertOpts.hidden = !convertOn;
    if (compressOpts) compressOpts.hidden = !compressOn;
    root.querySelectorAll(".tool-check").forEach((label) => {
      const input = label.querySelector("input");
      label.classList.toggle("on", Boolean(input && input.checked));
    });
    if (runBtn) {
      runBtn.disabled = !sourceFile || (!convertOn && !compressOn);
      runBtn.textContent =
        convertOn && compressOn
          ? "Convert & compress"
          : convertOn
            ? "Convert"
            : compressOn
              ? "Compress"
              : "Run";
    }
  }

  function syncCompressModeUI() {
    const mode = (modeSelect && modeSelect.value) || "size";
    root.querySelectorAll("[data-cp-for]").forEach((el) => {
      const forMode = el.getAttribute("data-cp-for");
      el.hidden = forMode !== mode && forMode !== "always";
    });
  }

  async function showSourcePreview(file) {
    revokeSourcePreview();
    if (!sourcePreview || !file) return;
    const kind = sourceKind(file);
    if (kind === "image") {
      sourcePreviewUrl = URL.createObjectURL(file);
      const img = document.createElement("img");
      img.alt = "Source preview";
      img.src = sourcePreviewUrl;
      img.onerror = () => {
        sourcePreview.classList.remove("show");
        sourcePreview.innerHTML = "";
      };
      sourcePreview.appendChild(img);
      sourcePreview.classList.add("show");
      return;
    }
    if (kind === "pdf") {
      sourcePreviewUrl = URL.createObjectURL(file);
      const frame = document.createElement("iframe");
      frame.title = "PDF preview";
      frame.src = sourcePreviewUrl;
      sourcePreview.appendChild(frame);
      sourcePreview.classList.add("show");
      return;
    }
    if (kind === "heic") {
      const note = document.createElement("p");
      note.className = "cv-preview-note";
      note.textContent = "HEIC preview after convert";
      sourcePreview.appendChild(note);
      sourcePreview.classList.add("show");
    }
  }

  function setSource(file) {
    sourceFile = file || null;
    clearResult();
    if (nameEl) nameEl.textContent = file ? file.name : "No file selected";
    if (file) {
      refreshFormatOptions(file);
      showSourcePreview(file);
      const kind = sourceKind(file);
      if (doCompress && (kind === "heic" || kind === "pdf" || kind === "docx")) {
        // Compress is image-only; leave checkbox state but Run will validate
      }
      const kind = sourceKind(file);
      if (kind === "audio" || kind === "video") {
        setStatus(
          "A/V conversion uses FFmpeg in the convert host — first run may load a large WASM module.",
          "ok"
        );
      } else {
        setStatus("Choose Convert and/or Compress, then Run", "ok");
      }
    } else {
      revokeSourcePreview();
      setStatus("");
    }
    syncOpSections();
  }

  function hideConfirm() {
    revokeConfirmUrls();
    pendingResult = null;
    if (confirmEl) {
      confirmEl.hidden = true;
      confirmEl.classList.remove("show");
    }
  }

  function previewUrlFor(file) {
    if (!file) return null;
    const mime = file.type || Mime.mimeFromFile(file);
    if (!isBrowserImage(mime)) return null;
    return URL.createObjectURL(file);
  }

  function showConfirm(beforeFile, afterFile, note) {
    if (!confirmEl || !confirmMount) {
      acceptPending(afterFile);
      return;
    }
    revokeConfirmUrls();
    pendingResult = afterFile;
    confirmBeforeUrl = previewUrlFor(beforeFile);
    confirmAfterUrl = previewUrlFor(afterFile);

    Compare.mount(confirmMount, {
      title: "Review result",
      beforeUrl: confirmBeforeUrl,
      afterUrl: confirmAfterUrl,
      beforeType: beforeFile ? Mime.mimeFromFile(beforeFile) : "",
      afterType: afterFile ? Mime.mimeFromFile(afterFile) : "",
      beforeSize: beforeFile ? beforeFile.size : undefined,
      afterSize: afterFile ? afterFile.size : undefined,
      beforeName: beforeFile ? beforeFile.name : "",
      afterName: afterFile ? afterFile.name : "",
      note: note || undefined
    });

    confirmEl.hidden = false;
    confirmEl.classList.add("show");
    setStatus("Review before / after, then Accept or Cancel", "ok");
  }

  function acceptPending(file) {
    const out = file || pendingResult;
    hideConfirm();
    if (!out) return;
    resultFile = out;
    revokeObjectUrl();
    objectUrl = URL.createObjectURL(out);
    if (downloadBtn) downloadBtn.disabled = false;
    if (dragHandle) {
      dragHandle.draggable = true;
      dragHandle.removeAttribute("aria-disabled");
      dragHandle.classList.add("ready");
    }
    setStatus(`Ready → ${out.name} (${Compare.fmtBytes(out.size)})`, "ok");
  }

  function cancelPending() {
    hideConfirm();
    setStatus("Cancelled — tweak options and Run again", "ok");
  }

  async function runPipeline() {
    if (!sourceFile) return;
    const convertOn = Boolean(doConvert && doConvert.checked);
    const compressOn = Boolean(doCompress && doCompress.checked);
    if (!convertOn && !compressOn) {
      setStatus("Enable Convert and/or Compress", "bad");
      return;
    }

    clearResult();
    if (runBtn) runBtn.disabled = true;
    setStatus(convertOn && compressOn ? "Converting…" : convertOn ? "Converting…" : "Compressing…");

    try {
      let working = sourceFile;
      let note = "";

      if (convertOn) {
        const target = (formatSelect && formatSelect.value) || "image/png";
        if (!Registry.canHandle(working, target)) {
          throw new Error("Cannot convert this file to " + target);
        }
        const kind = sourceKind(working);
        if (kind === "audio" || kind === "video") {
          setStatus("Loading FFmpeg / converting A/V… (first load can be slow)");
        }
        working = await Registry.convertFile(working, target);
      }

      if (compressOn) {
        if (!Compress.canCompress(working)) {
          throw new Error(
            convertOn
              ? "Converted file cannot be compressed (need an image). Try an image target format."
              : "This file type cannot be compressed here (convert HEIC/PDF to an image first)."
          );
        }
        setStatus(convertOn ? "Compressing…" : "Compressing…");
        const mode = (modeSelect && modeSelect.value) || "size";
        // Keep source/converted type; compress auto-switches PNG→JPEG when chasing a byte budget.
        const opts = {
          fileName: working.name,
          maxWidth: maxW && maxW.value ? Number(maxW.value) : 0,
          maxHeight: maxH && maxH.value ? Number(maxH.value) : 0
        };
        if (mode === "size") {
          const kb = targetKb && targetKb.value ? Number(targetKb.value) : 200;
          opts.maxBytes = Math.max(4, Math.floor(kb * 1024));
          opts.qualityPref = "balanced";
        } else {
          const q = quality && quality.value ? Number(quality.value) / 100 : 0.8;
          opts.quality = Math.min(1, Math.max(0.1, q));
        }
        working = await Compress.compressImage(working, opts);
      }

      if (!isBrowserImage(Mime.mimeFromFile(sourceFile)) && !isBrowserImage(Mime.mimeFromFile(working))) {
        note =
          "Visual wipe is unavailable for this convert — sizes and formats are shown above.";
      } else if (!isBrowserImage(Mime.mimeFromFile(sourceFile))) {
        note = "Original is not a browser-viewable image; showing the result when possible.";
      }

      showConfirm(sourceFile, working, note);
    } catch (err) {
      clearResult();
      setStatus(String(err && err.message ? err.message : err), "bad");
    } finally {
      syncOpSections();
    }
  }

  function downloadResult() {
    if (!resultFile) return;
    if (!objectUrl) objectUrl = URL.createObjectURL(resultFile);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = resultFile.name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function onDragStart(event) {
    if (!resultFile) {
      event.preventDefault();
      return;
    }
    if (!objectUrl) objectUrl = URL.createObjectURL(resultFile);
    const dt = event.dataTransfer;
    if (!dt) return;
    dt.effectAllowed = "copy";
    try {
      dt.items.add(resultFile);
    } catch (_) {
      /* ignore */
    }
    try {
      const safeName = String(resultFile.name).replace(/[:\r\n]/g, "_");
      dt.setData(
        "DownloadURL",
        `${resultFile.type || "application/octet-stream"}:${safeName}:${objectUrl}`
      );
    } catch (_) {
      /* ignore */
    }
    try {
      dt.setData("text/uri-list", objectUrl);
      dt.setData("text/plain", resultFile.name);
    } catch (_) {
      /* ignore */
    }
  }

  if (drop) {
    ["dragenter", "dragover"].forEach((type) => {
      drop.addEventListener(type, (e) => {
        e.preventDefault();
        drop.classList.add("over");
      });
    });
    drop.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      drop.classList.remove("over");
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) setSource(file);
    });
    drop.addEventListener("click", (e) => {
      if (e.target.closest("button, select, a, [data-tool-drag], [data-tool-confirm]")) return;
      if (fileInput) fileInput.click();
    });
  }

  if (fileInput) {
    fileInput.addEventListener("change", () => {
      const file = fileInput.files && fileInput.files[0];
      setSource(file || null);
      fileInput.value = "";
    });
  }

  [doConvert, doCompress].forEach((el) => {
    if (!el) return;
    el.addEventListener("change", () => {
      clearResult();
      syncOpSections();
      if (sourceFile) setStatus("Choose Convert and/or Compress, then Run", "ok");
    });
  });

  if (modeSelect) {
    modeSelect.addEventListener("change", () => {
      syncCompressModeUI();
      clearResult();
      if (sourceFile) setStatus("Ready — Run again after tweaks", "ok");
    });
  }

  ["input", "change"].forEach((evt) => {
    [formatSelect, targetKb, quality, maxW, maxH].forEach((el) => {
      if (!el) return;
      el.addEventListener(evt, () => {
        clearResult();
        if (sourceFile) setStatus("Ready — Run again after tweaks", "ok");
      });
    });
  });

  if (runBtn) runBtn.addEventListener("click", () => runPipeline());
  if (downloadBtn) downloadBtn.addEventListener("click", () => downloadResult());
  if (acceptBtn) acceptBtn.addEventListener("click", () => acceptPending());
  if (cancelBtn) cancelBtn.addEventListener("click", () => cancelPending());
  if (dragHandle) {
    dragHandle.addEventListener("dragstart", onDragStart);
  }

  if (openPanelBtn) {
    openPanelBtn.addEventListener("click", () => {
      const url = chrome.runtime.getURL("src/options/converter.html");
      if (chrome.windows && chrome.windows.create) {
        chrome.windows.create({
          url,
          type: "popup",
          width: 460,
          height: 760,
          focused: true
        });
      } else {
        window.open(url, "swiftconvert-converter", "width=460,height=760");
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && confirmEl && !confirmEl.hidden) {
      cancelPending();
    }
  });

  window.addEventListener("unload", () => {
    revokeObjectUrl();
    revokeSourcePreview();
    revokeConfirmUrls();
  });

  syncCompressModeUI();
  syncOpSections();
  setSource(null);
})();
