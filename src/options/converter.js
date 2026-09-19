/**
 * Manual converter UI — pick/drop → choose format → download or drag out.
 * Shared by the toolbar popup and the detached converter panel.
 *
 * Expects classic scripts already loaded:
 *   SwiftConvertMime, SwiftConvertImage, SwiftConvertStubs, SwiftConvertRegistry
 */
(function () {
  const Mime = globalThis.SwiftConvertMime;
  const Registry = globalThis.SwiftConvertRegistry;
  if (!Mime || !Registry) {
    console.warn("[SwiftConvert] converter UI missing registry");
    return;
  }

  const root = document.getElementById("manualConverter");
  if (!root) return;

  const drop = root.querySelector("[data-cv-drop]");
  const fileInput = root.querySelector("[data-cv-file]");
  const formatSelect = root.querySelector("[data-cv-format]");
  const convertBtn = root.querySelector("[data-cv-convert]");
  const downloadBtn = root.querySelector("[data-cv-download]");
  const dragHandle = root.querySelector("[data-cv-drag]");
  const statusEl = root.querySelector("[data-cv-status]");
  const openPanelBtn = root.querySelector("[data-cv-open-panel]");
  const nameEl = root.querySelector("[data-cv-name]");

  /** @type {File | null} */
  let sourceFile = null;
  /** @type {File | null} */
  let convertedFile = null;
  /** @type {string | null} */
  let objectUrl = null;

  function setStatus(text, kind) {
    if (!statusEl) return;
    statusEl.textContent = text || "";
    statusEl.dataset.kind = kind || "";
  }

  function revokeUrl() {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
  }

  function clearConverted() {
    convertedFile = null;
    revokeUrl();
    if (downloadBtn) downloadBtn.disabled = true;
    if (dragHandle) {
      dragHandle.draggable = false;
      dragHandle.setAttribute("aria-disabled", "true");
      dragHandle.classList.remove("ready");
    }
  }

  function setSource(file) {
    sourceFile = file || null;
    clearConverted();
    if (nameEl) nameEl.textContent = file ? file.name : "No file selected";
    if (convertBtn) convertBtn.disabled = !file;
    if (file) {
      setStatus("Ready to convert", "ok");
    } else {
      setStatus("");
    }
  }

  function markConverted(file) {
    convertedFile = file;
    revokeUrl();
    objectUrl = URL.createObjectURL(file);
    if (downloadBtn) downloadBtn.disabled = false;
    if (dragHandle) {
      dragHandle.draggable = true;
      dragHandle.removeAttribute("aria-disabled");
      dragHandle.classList.add("ready");
    }
    setStatus(`Converted → ${file.name} (${file.type || "unknown"})`, "ok");
  }

  async function runConvert() {
    if (!sourceFile) return;
    const format = (formatSelect && formatSelect.value) || "png";
    const target =
      format === "jpeg" || format === "jpg"
        ? "image/jpeg"
        : format === "webp"
          ? "image/webp"
          : "image/png";

    if (!Registry.canHandle(sourceFile, target)) {
      setStatus("Cannot convert this file to " + target, "bad");
      return;
    }

    if (convertBtn) convertBtn.disabled = true;
    setStatus("Converting…");
    try {
      const out = await Registry.convertFile(sourceFile, target);
      markConverted(out);
    } catch (err) {
      clearConverted();
      setStatus(String(err && err.message ? err.message : err), "bad");
    } finally {
      if (convertBtn) convertBtn.disabled = !sourceFile;
    }
  }

  function downloadConverted() {
    if (!convertedFile) return;
    if (!objectUrl) objectUrl = URL.createObjectURL(convertedFile);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = convertedFile.name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /**
   * Best-effort HTML5 drag-out for extension pages.
   * Chrome often closes the *toolbar popup* when focus leaves, which cancels
   * the drag — use the detached converter panel for reliable drag-out.
   * DownloadURL + File items are both set for broader host-page support.
   */
  function onDragStart(event) {
    if (!convertedFile) {
      event.preventDefault();
      return;
    }
    if (!objectUrl) objectUrl = URL.createObjectURL(convertedFile);
    const dt = event.dataTransfer;
    if (!dt) return;

    dt.effectAllowed = "copy";
    try {
      dt.items.add(convertedFile);
    } catch (_) {
      /* some engines reject File on extension pages */
    }
    try {
      // DownloadURL: mime:filename:url — works for many page drop targets / downloads
      const safeName = String(convertedFile.name).replace(/[:\r\n]/g, "_");
      dt.setData(
        "DownloadURL",
        `${convertedFile.type || "application/octet-stream"}:${safeName}:${objectUrl}`
      );
    } catch (_) {
      /* ignore */
    }
    try {
      dt.setData("text/uri-list", objectUrl);
      dt.setData("text/plain", convertedFile.name);
    } catch (_) {
      /* ignore */
    }
  }

  function onDragEnd() {
    // Keep objectUrl alive so a successful drop can still fetch the blob URL
    // briefly; revoke on next conversion / unload.
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
      if (e.target.closest("button, select, a, [data-cv-drag]")) return;
      if (fileInput) fileInput.click();
    });
  }

  if (fileInput) {
    fileInput.addEventListener("change", () => {
      const file = fileInput.files && fileInput.files[0];
      setSource(file || null);
      // Allow re-selecting the same path later
      fileInput.value = "";
    });
  }

  if (formatSelect) {
    formatSelect.addEventListener("change", () => {
      if (convertedFile) clearConverted();
      if (sourceFile) setStatus("Ready to convert", "ok");
    });
  }

  if (convertBtn) convertBtn.addEventListener("click", () => runConvert());
  if (downloadBtn) downloadBtn.addEventListener("click", () => downloadConverted());
  if (dragHandle) {
    dragHandle.addEventListener("dragstart", onDragStart);
    dragHandle.addEventListener("dragend", onDragEnd);
  }

  if (openPanelBtn) {
    openPanelBtn.addEventListener("click", () => {
      const url = chrome.runtime.getURL("src/options/converter.html");
      // Detached window survives blur — required for reliable drag-out from Chrome.
      if (chrome.windows && chrome.windows.create) {
        chrome.windows.create({
          url,
          type: "popup",
          width: 420,
          height: 560,
          focused: true
        });
      } else {
        window.open(url, "swiftconvert-converter", "width=420,height=560");
      }
    });
  }

  window.addEventListener("unload", revokeUrl);
  setSource(null);
})();
