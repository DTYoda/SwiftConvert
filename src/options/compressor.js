/**
 * Manual image compressor UI — pick/drop → target size / quality / max dims
 * → preview before/after sizes → download or drag out.
 * Matches converter panel patterns (DownloadURL drag-out).
 */
(function () {
  const Mime = globalThis.SwiftConvertMime;
  const Compress = globalThis.SwiftConvertCompress;
  if (!Mime || !Compress) {
    console.warn("[SwiftConvert] compressor UI missing libs");
    return;
  }

  const root = document.getElementById("manualCompressor");
  if (!root) return;

  const drop = root.querySelector("[data-cp-drop]");
  const fileInput = root.querySelector("[data-cp-file]");
  const nameEl = root.querySelector("[data-cp-name]");
  const previewEl = root.querySelector("[data-cp-preview]");
  const modeSelect = root.querySelector("[data-cp-mode]");
  const targetKb = root.querySelector("[data-cp-target-kb]");
  const quality = root.querySelector("[data-cp-quality]");
  const maxW = root.querySelector("[data-cp-max-w]");
  const maxH = root.querySelector("[data-cp-max-h]");
  const formatSelect = root.querySelector("[data-cp-format]");
  const runBtn = root.querySelector("[data-cp-run]");
  const downloadBtn = root.querySelector("[data-cp-download]");
  const dragHandle = root.querySelector("[data-cp-drag]");
  const statusEl = root.querySelector("[data-cp-status]");
  const sizesEl = root.querySelector("[data-cp-sizes]");
  const openPanelBtn = root.querySelector("[data-cp-open-panel]");

  /** @type {File | null} */
  let sourceFile = null;
  /** @type {File | null} */
  let resultFile = null;
  /** @type {string | null} */
  let objectUrl = null;
  /** @type {string | null} */
  let previewUrl = null;

  function setStatus(text, kind) {
    if (!statusEl) return;
    statusEl.textContent = text || "";
    statusEl.dataset.kind = kind || "";
  }

  function fmtBytes(n) {
    if (!(n >= 0)) return "—";
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(2) + " MB";
  }

  function revokeUrl() {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
  }

  function revokePreview() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = null;
    }
    if (previewEl) {
      previewEl.classList.remove("show");
      previewEl.innerHTML = "";
    }
  }

  function clearResult() {
    resultFile = null;
    revokeUrl();
    if (downloadBtn) downloadBtn.disabled = true;
    if (dragHandle) {
      dragHandle.draggable = false;
      dragHandle.setAttribute("aria-disabled", "true");
      dragHandle.classList.remove("ready");
    }
    if (sizesEl) sizesEl.textContent = "";
  }

  function syncModeUI() {
    const mode = (modeSelect && modeSelect.value) || "size";
    root.querySelectorAll("[data-cp-for]").forEach((el) => {
      const forMode = el.getAttribute("data-cp-for");
      el.hidden = forMode !== mode && forMode !== "always";
    });
  }

  function showPreview(file) {
    revokePreview();
    if (!previewEl || !file) return;
    if (!(file.type || Mime.mimeFromFile(file)).startsWith("image/")) return;
    previewUrl = URL.createObjectURL(file);
    const img = document.createElement("img");
    img.alt = "Preview";
    img.src = previewUrl;
    img.onerror = () => {
      previewEl.classList.remove("show");
      previewEl.innerHTML = "";
    };
    previewEl.appendChild(img);
    previewEl.classList.add("show");
  }

  function setSource(file) {
    sourceFile = file || null;
    clearResult();
    if (nameEl) nameEl.textContent = file ? file.name : "No file selected";
    if (runBtn) runBtn.disabled = !file;
    if (file) {
      showPreview(file);
      if (sizesEl) {
        sizesEl.textContent = `Original: ${fmtBytes(file.size)}`;
      }
      setStatus("Ready to compress", "ok");
    } else {
      revokePreview();
      setStatus("");
      if (sizesEl) sizesEl.textContent = "";
    }
  }

  function markResult(file, before) {
    resultFile = file;
    revokeUrl();
    objectUrl = URL.createObjectURL(file);
    if (downloadBtn) downloadBtn.disabled = false;
    if (dragHandle) {
      dragHandle.draggable = true;
      dragHandle.removeAttribute("aria-disabled");
      dragHandle.classList.add("ready");
    }
    if (sizesEl) {
      sizesEl.textContent =
        `Before: ${fmtBytes(before)} → After: ${fmtBytes(file.size)}` +
        (before > file.size
          ? ` (−${Math.round((1 - file.size / before) * 100)}%)`
          : "");
    }
    setStatus(`Compressed → ${file.name}`, "ok");
    showPreview(file);
    // Recreate download URL after preview may have taken objectUrl ownership
    if (!objectUrl) objectUrl = URL.createObjectURL(file);
  }

  async function runCompress() {
    if (!sourceFile) return;
    if (!Compress.canCompress(sourceFile)) {
      setStatus("This file type cannot be compressed here (try converting HEIC first).", "bad");
      return;
    }

    const mode = (modeSelect && modeSelect.value) || "size";
    const mime =
      (formatSelect && formatSelect.value) ||
      Mime.mimeFromFile(sourceFile) ||
      "image/jpeg";

    const opts = {
      mime,
      fileName: sourceFile.name,
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

    if (runBtn) runBtn.disabled = true;
    setStatus("Compressing…");
    try {
      const out = await Compress.compressImage(sourceFile, opts);
      markResult(out, sourceFile.size);
    } catch (err) {
      clearResult();
      setStatus(String(err && err.message ? err.message : err), "bad");
    } finally {
      if (runBtn) runBtn.disabled = !sourceFile;
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
    drop.addEventListener("click", () => {
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

  if (modeSelect) {
    modeSelect.addEventListener("change", () => {
      syncModeUI();
      clearResult();
      if (sourceFile) setStatus("Ready to compress", "ok");
    });
  }

  ["input", "change"].forEach((evt) => {
    [targetKb, quality, maxW, maxH, formatSelect].forEach((el) => {
      if (!el) return;
      el.addEventListener(evt, () => {
        clearResult();
        if (sourceFile) setStatus("Ready to compress", "ok");
      });
    });
  });

  if (runBtn) runBtn.addEventListener("click", () => runCompress());
  if (downloadBtn) downloadBtn.addEventListener("click", () => downloadResult());
  if (dragHandle) {
    dragHandle.addEventListener("dragstart", onDragStart);
  }

  if (openPanelBtn) {
    openPanelBtn.addEventListener("click", () => {
      const url = chrome.runtime.getURL("src/options/converter.html#compress");
      if (chrome.windows && chrome.windows.create) {
        chrome.windows.create({
          url,
          type: "popup",
          width: 440,
          height: 720,
          focused: true
        });
      } else {
        window.open(url, "swiftconvert-converter", "width=440,height=720");
      }
    });
  }

  window.addEventListener("unload", () => {
    revokeUrl();
    revokePreview();
  });

  syncModeUI();
  setSource(null);
})();
