/**
 * Manual converter UI — pick/drop → choose format → download or drag out.
 * Shared by the toolbar popup and the detached converter panel.
 *
 * Expects classic scripts already loaded:
 *   SwiftConvertMime, converters, SwiftConvertRegistry
 * And pdfjsLib when converting PDF → image.
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
  const previewEl = root.querySelector("[data-cv-preview]");

  /** @type {File | null} */
  let sourceFile = null;
  /** @type {File | null} */
  let convertedFile = null;
  /** @type {string | null} */
  let objectUrl = null;
  /** @type {string | null} */
  let previewUrl = null;

  const DOCX =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

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

  function sourceKind(file) {
    const mime = Mime.mimeFromFile(file);
    if (mime === "image/heic" || mime === "image/heif") return "heic";
    if (mime === "application/pdf") return "pdf";
    if (mime === DOCX || mime === "application/msword") return "docx";
    if (mime.startsWith("image/")) return "image";
    return "other";
  }

  function optionsFor(file) {
    const kind = sourceKind(file);
    if (kind === "heic") {
      return [
        ["image/jpeg", "JPEG"],
        ["image/png", "PNG"],
        ["image/webp", "WebP"]
      ];
    }
    if (kind === "pdf") {
      return [
        ["image/png", "PNG (page 1)"],
        ["image/jpeg", "JPEG (page 1)"],
        ["image/webp", "WebP (page 1)"]
      ];
    }
    if (kind === "docx") {
      return [
        ["text/plain", "Plain text"],
        ["text/html", "HTML"],
        ["application/pdf", "PDF (text)"]
      ];
    }
    if (kind === "image") {
      return [
        ["image/png", "PNG"],
        ["image/jpeg", "JPEG"],
        ["image/webp", "WebP"],
        ["application/pdf", "PDF"]
      ];
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

  async function showSourcePreview(file) {
    revokePreview();
    if (!previewEl || !file) return;
    const kind = sourceKind(file);
    if (kind === "image" || kind === "heic") {
      // HEIC may not preview natively — try object URL anyway
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
      return;
    }
    if (kind === "pdf") {
      previewUrl = URL.createObjectURL(file);
      const frame = document.createElement("iframe");
      frame.title = "PDF preview";
      frame.src = previewUrl;
      previewEl.appendChild(frame);
      previewEl.classList.add("show");
    }
  }

  function setSource(file) {
    sourceFile = file || null;
    clearConverted();
    if (nameEl) nameEl.textContent = file ? file.name : "No file selected";
    if (convertBtn) convertBtn.disabled = !file;
    if (file) {
      refreshFormatOptions(file);
      showSourcePreview(file);
      setStatus("Ready to convert", "ok");
    } else {
      revokePreview();
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
    // Prefer showing conversion result for images
    if ((file.type || "").startsWith("image/") && previewEl) {
      revokePreview();
      previewUrl = objectUrl;
      objectUrl = null; // preview owns it; download will recreate
      const img = document.createElement("img");
      img.alt = "Converted preview";
      img.src = previewUrl;
      previewEl.appendChild(img);
      previewEl.classList.add("show");
      objectUrl = URL.createObjectURL(file);
    }
  }

  async function runConvert() {
    if (!sourceFile) return;
    const target = (formatSelect && formatSelect.value) || "image/png";

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

  function onDragEnd() {}

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
      if (chrome.windows && chrome.windows.create) {
        chrome.windows.create({
          url,
          type: "popup",
          width: 440,
          height: 640,
          focused: true
        });
      } else {
        window.open(url, "swiftconvert-converter", "width=440,height=640");
      }
    });
  }

  window.addEventListener("unload", () => {
    revokeUrl();
    revokePreview();
  });
  setSource(null);
})();
