/**
 * Content-script bridge (isolated world): syncs settings with the page-world hook,
 * hosts preview / toast / coverage badges, and proxies HEIC/PDF/DOCX converts
 * through a hidden extension-page iframe (CSP-safe WASM / workers).
 */
(function () {
  if (window.__SWIFTCONVERT_BRIDGE__) return;
  window.__SWIFTCONVERT_BRIDGE__ = true;

  const CHANNEL = "swiftconvert";
  const HOST_CHANNEL = "swiftconvert-host";
  const DEFAULTS = {
    enabled: true,
    previewBeforeUpload: false,
    preferredImageFormat: "auto",
    showQuietBadge: true,
    autoCompress: true,
    useDefaultMaxWhenNoLimit: false,
    defaultMaxSizeMB: 2,
    compressQuality: "balanced"
  };

  let settings = { ...DEFAULTS };
  let host = null;
  let shadow = null;
  let quietTimer = null;
  let injectAttempted = false;
  let badgeLayer = null;
  let badgeRaf = 0;

  /** @type {HTMLIFrameElement | null} */
  let convertFrame = null;
  let convertReady = null;
  let convertReadyResolve = null;
  const pendingHost = new Map();
  let hostMsgSeq = 0;

    const PAGE_SCRIPTS = [
    "src/lib/mime.js",
    "src/lib/converters/image.js",
    "src/lib/compress.js",
    "src/lib/size-limit.js",
    "src/lib/converters/pdf-write.js",
    "src/lib/converters/stubs.js",
    "src/lib/converters/registry.js",
    "src/content/page-hook.js"
  ];

  // 32px source displayed at ~18px keeps badges sharp on retina
  const LOGO_URL = chrome.runtime.getURL("icons/icon32.png");

  function isPageHooked() {
    try {
      return document.documentElement.getAttribute("data-swiftconvert-hooked") === "1";
    } catch {
      return false;
    }
  }

  function injectScriptsFallback() {
    if (injectAttempted || isPageHooked()) return;
    injectAttempted = true;
    let chain = Promise.resolve();
    for (const path of PAGE_SCRIPTS) {
      chain = chain.then(
        () =>
          new Promise((resolve, reject) => {
            const s = document.createElement("script");
            s.src = chrome.runtime.getURL(path);
            s.async = false;
            s.onload = () => {
              s.remove();
              resolve();
            };
            s.onerror = () => reject(new Error("Failed to inject " + path));
            (document.documentElement || document.head || document.body).appendChild(s);
          })
      );
    }
    return chain.catch((err) => console.warn("[SwiftConvert] fallback inject:", err));
  }

  function sendSettingsToPage() {
    window.postMessage(
      { source: CHANNEL, direction: "bridge-to-page", type: "settings", payload: settings },
      "*"
    );
  }

  function loadSettings() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get(DEFAULTS, (data) => {
          settings = { ...DEFAULTS, ...data };
          resolve(settings);
        });
      } catch {
        resolve(settings);
      }
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" && area !== "local") return;
    let changed = false;
    for (const key of Object.keys(DEFAULTS)) {
      if (changes[key]) {
        settings[key] = changes[key].newValue;
        changed = true;
      }
    }
    if (changed) {
      sendSettingsToPage();
      scheduleBadgeRefresh();
    }
  });

  function ensureConvertFrame() {
    if (convertFrame && convertFrame.contentWindow) return convertReady;
    if (!convertReady) {
      convertReady = new Promise((resolve) => {
        convertReadyResolve = resolve;
      });
    }
    convertFrame = document.createElement("iframe");
    convertFrame.id = "swiftconvert-convert-frame";
    convertFrame.title = "SwiftConvert converter";
    convertFrame.src = chrome.runtime.getURL("src/convert/host.html");
    convertFrame.setAttribute("aria-hidden", "true");
    convertFrame.style.cssText =
      "position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none;left:-9999px;top:0;";
    (document.documentElement || document.body).appendChild(convertFrame);
    return convertReady;
  }

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data) return;

    if (data.source === HOST_CHANNEL) {
      if (data.type === "ready" && convertReadyResolve) {
        convertReadyResolve();
        convertReadyResolve = null;
      }
      if (data.type === "convert-result") {
        const entry = pendingHost.get(data.id);
        if (!entry) return;
        pendingHost.delete(data.id);
        if (data.ok) entry.resolve(data.result);
        else entry.reject(new Error(data.error || "Convert failed"));
      }
      return;
    }

    if (event.source !== window) return;
    if (data.source !== CHANNEL || data.direction !== "page-to-bridge") return;

    switch (data.type) {
      case "ready":
      case "hooked":
        sendSettingsToPage();
        scheduleBadgeRefresh();
        break;
      case "coverage":
        scheduleBadgeRefresh();
        break;
      case "preview":
        showPreview(data.payload);
        break;
      case "converted-quiet":
        showQuietToast(data.payload);
        break;
      case "converted":
        chrome.runtime.sendMessage({ type: "converted", payload: data.payload }).catch(() => {});
        break;
      case "error":
        console.warn("[SwiftConvert]", data.payload && data.payload.message);
        break;
      case "convert-request":
        handleConvertRequest(data.payload);
        break;
      case "skip":
        break;
      default:
        break;
    }
  });

  async function handleConvertRequest(payload) {
    const id = payload && payload.id;
    try {
      await ensureConvertFrame();
      // give the module a beat if ready raced
      if (convertFrame && !convertFrame.contentWindow) {
        await new Promise((r) => setTimeout(r, 50));
      }
      const result = await sendToHost(payload);
      window.postMessage(
        {
          source: CHANNEL,
          direction: "bridge-to-page",
          type: "convert-result",
          payload: {
            id,
            ok: true,
            file: result
          }
        },
        "*"
      );
    } catch (err) {
      window.postMessage(
        {
          source: CHANNEL,
          direction: "bridge-to-page",
          type: "convert-result",
          payload: {
            id,
            ok: false,
            error: String(err && err.message ? err.message : err)
          }
        },
        "*"
      );
    }
  }

  function sendToHost(payload) {
    return new Promise(async (resolve, reject) => {
      await ensureConvertFrame();
      const id = ++hostMsgSeq;
      pendingHost.set(id, { resolve, reject });
      const win = convertFrame && convertFrame.contentWindow;
      if (!win) {
        pendingHost.delete(id);
        reject(new Error("Convert host unavailable"));
        return;
      }
      const transfer = [];
      if (payload.bytes && payload.bytes instanceof ArrayBuffer) {
        transfer.push(payload.bytes);
      }
      win.postMessage(
        {
          source: HOST_CHANNEL,
          type: "convert",
          id,
          payload: {
            name: payload.name,
            type: payload.type,
            lastModified: payload.lastModified,
            targetMime: payload.targetMime,
            bytes: payload.bytes
          }
        },
        "*",
        transfer
      );
      setTimeout(() => {
        if (pendingHost.has(id)) {
          pendingHost.delete(id);
          reject(new Error("Convert host timed out"));
        }
      }, 120000);
    });
  }

  function ensureHost() {
    if (host) return shadow;
    host = document.createElement("div");
    host.id = "swiftconvert-root";
    host.style.all = "initial";
    host.style.position = "fixed";
    host.style.zIndex = "2147483646";
    host.style.top = "0";
    host.style.left = "0";
    host.style.width = "0";
    host.style.height = "0";
    host.style.pointerEvents = "none";
    shadow = host.attachShadow({ mode: "closed" });
    document.documentElement.appendChild(host);
    return shadow;
  }

  function ensureBadgeLayer() {
    const root = ensureHost();
    if (badgeLayer) return badgeLayer;
    const style = document.createElement("style");
    style.textContent = `
      #sc-badges { position: fixed; inset: 0; pointer-events: none; z-index: 2147483645; }
      .sc-badge {
        position: fixed;
        width: 18px; height: 18px;
        border-radius: 5px;
        overflow: hidden;
        box-shadow: 0 1px 2px rgba(12, 31, 46, 0.28);
        opacity: 0.94;
        pointer-events: none;
        user-select: none;
        background: #146B63;
      }
      .sc-badge img {
        display: block;
        width: 18px;
        height: 18px;
      }
    `;
    root.appendChild(style);
    badgeLayer = document.createElement("div");
    badgeLayer.id = "sc-badges";
    root.appendChild(badgeLayer);
    return badgeLayer;
  }

  function anchorForCovered(el) {
    if (!(el && el.getBoundingClientRect)) return null;
    if (el instanceof HTMLInputElement && el.type === "file") {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const hidden =
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.opacity === "0" ||
        rect.width < 2 ||
        rect.height < 2;
      if (hidden) {
        if (el.id) {
          const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
          if (label) return label;
        }
        const wrapping = el.closest("label");
        if (wrapping) return wrapping;
        const parent = el.parentElement;
        if (parent) {
          const btn = parent.querySelector("button, [role='button'], .drop, .dropzone");
          if (btn) return btn;
        }
      }
    }
    return el;
  }

  function scheduleBadgeRefresh() {
    if (badgeRaf) cancelAnimationFrame(badgeRaf);
    badgeRaf = requestAnimationFrame(() => {
      badgeRaf = 0;
      renderCoverageBadges();
    });
  }

  function renderCoverageBadges() {
    if (!settings.enabled) {
      if (badgeLayer) badgeLayer.textContent = "";
      return;
    }
    const covered = document.querySelectorAll("[data-swiftconvert-covered='1']");
    if (!covered.length) {
      if (badgeLayer) badgeLayer.textContent = "";
      return;
    }
    const layer = ensureBadgeLayer();
    layer.textContent = "";
    const seen = new Set();
    covered.forEach((el) => {
      const anchor = anchorForCovered(el);
      if (!anchor || seen.has(anchor)) return;
      const rect = anchor.getBoundingClientRect();
      if (rect.width < 2 && rect.height < 2) return;
      if (rect.bottom < 0 || rect.top > window.innerHeight) return;
      if (rect.right < 0 || rect.left > window.innerWidth) return;
      seen.add(anchor);
      const badge = document.createElement("div");
      badge.className = "sc-badge";
      badge.title = "SwiftConvert will convert mismatched uploads for this field";
      const img = document.createElement("img");
      img.src = LOGO_URL;
      img.alt = "";
      img.width = 18;
      img.height = 18;
      badge.appendChild(img);
      const top = Math.max(4, rect.top + 2);
      const left = Math.min(window.innerWidth - 22, Math.max(4, rect.right - 16));
      badge.style.top = `${Math.round(top)}px`;
      badge.style.left = `${Math.round(left)}px`;
      layer.appendChild(badge);
    });
  }

  window.addEventListener("scroll", scheduleBadgeRefresh, true);
  window.addEventListener("resize", scheduleBadgeRefresh);

  function showQuietToast(payload) {
    if (!settings.showQuietBadge) return;
    const root = ensureHost();
    let toast = root.getElementById("sc-toast");
    if (!toast) {
      const style = document.createElement("style");
      style.textContent = `
        #sc-toast {
          position: fixed; right: 16px; bottom: 16px;
          display: flex; align-items: center; gap: 10px;
          font: 500 13px/1.4 Outfit, "Trebuchet MS", "Segoe UI", sans-serif;
          background: #0c1f2e; color: #e8f7f4;
          padding: 10px 14px; border-radius: 10px;
          box-shadow: 0 10px 28px rgba(12,31,46,.28);
          opacity: 0; transform: translateY(8px);
          transition: opacity .2s, transform .2s;
          max-width: 300px; pointer-events: none;
        }
        #sc-toast img { width: 20px; height: 20px; border-radius: 5px; flex: 0 0 auto; }
        #sc-toast.show { opacity: 1; transform: translateY(0); }
      `;
      root.appendChild(style);
      toast = document.createElement("div");
      toast.id = "sc-toast";
      toast.innerHTML = `<img alt="" width="20" height="20" /><span></span>`;
      toast.querySelector("img").src = chrome.runtime.getURL("icons/icon48.png");
      root.appendChild(toast);
    }
    toast.querySelector("span").textContent = formatQuietMessage(payload);
    toast.classList.add("show");
    clearTimeout(quietTimer);
    quietTimer = setTimeout(() => toast.classList.remove("show"), 2200);
  }

  function formatQuietMessage(payload) {
    if (!payload) return "SwiftConvert";
    if (payload.compressed && payload.from && payload.to && payload.from !== payload.to) {
      const sizes =
        payload.fromBytes && payload.toBytes
          ? ` · ${fmtKb(payload.fromBytes)} → ${fmtKb(payload.toBytes)}`
          : "";
      return `Converted & compressed ${payload.from} → ${payload.to}${sizes}`;
    }
    if (payload.compressed) {
      const sizes =
        payload.fromBytes && payload.toBytes
          ? ` ${fmtKb(payload.fromBytes)} → ${fmtKb(payload.toBytes)}`
          : "";
      return `Compressed${sizes}`;
    }
    if (payload.from && payload.to) {
      return `Converted ${payload.from} → ${payload.to}`;
    }
    return "SwiftConvert";
  }

  function fmtKb(n) {
    if (!(n > 0)) return "";
    if (n < 1024) return n + " B";
    return (n / 1024).toFixed(1) + " KB";
  }

  /** @type {string | null} */
  let previewBeforeUrl = null;
  /** @type {string | null} */
  let previewAfterUrl = null;

  function revokePreviewUrls() {
    if (previewBeforeUrl) {
      URL.revokeObjectURL(previewBeforeUrl);
      previewBeforeUrl = null;
    }
    if (previewAfterUrl) {
      URL.revokeObjectURL(previewAfterUrl);
      previewAfterUrl = null;
    }
  }

  function bytesToObjectUrl(bytes, mime) {
    if (!bytes) return null;
    try {
      const buf = bytes instanceof ArrayBuffer ? bytes : null;
      if (!buf) return null;
      const blob = new Blob([buf], { type: mime || "application/octet-stream" });
      return URL.createObjectURL(blob);
    } catch (_) {
      return null;
    }
  }

  function showPreview(payload) {
    const root = ensureHost();
    let panel = root.getElementById("sc-preview");
    if (!panel) {
      const style = document.createElement("style");
      style.textContent = `
        #sc-preview {
          position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
          background: rgba(12, 31, 46, 0.48);
          font: 14px/1.45 Outfit, "Trebuchet MS", "Segoe UI", sans-serif;
          pointer-events: auto;
          padding: 16px;
        }
        #sc-preview .card {
          background: linear-gradient(180deg, #ffffff 0%, #f3faf8 100%);
          color: #0c1f2e; width: min(460px, calc(100vw - 32px));
          max-height: calc(100vh - 32px); overflow: auto;
          border-radius: 14px; padding: 18px 20px 16px;
          box-shadow: 0 22px 55px rgba(12,31,46,.3);
          border: 1px solid rgba(20, 107, 99, 0.12);
        }
        #sc-preview .brand {
          display: flex; align-items: center; gap: 10px; margin-bottom: 10px;
        }
        #sc-preview .brand img { width: 28px; height: 28px; border-radius: 7px; }
        #sc-preview h2 { margin: 0; font-size: 17px; font-weight: 650; letter-spacing: -0.02em; }
        #sc-preview .body { margin: 0 0 8px; color: #3d5566; font-size: 13px; }
        #sc-preview .mount { margin: 8px 0 12px; }
        #sc-preview .row { display: flex; gap: 8px; justify-content: flex-end; }
        #sc-preview button {
          border: 0; border-radius: 9px; padding: 8px 14px; font: inherit; cursor: pointer;
        }
        #sc-preview .ghost { background: #e2ece9; color: #0c1f2e; }
        #sc-preview .primary { background: #146B63; color: #fff; }
        #sc-preview.hidden { display: none; }
        #sc-preview .sc-compare { display: flex; flex-direction: column; gap: 8px; }
        #sc-preview .sc-compare-title { font-size: 13px; font-weight: 650; color: #0c1f2e; }
        #sc-preview .sc-compare-meta {
          display: flex; flex-wrap: wrap; gap: 6px 12px; font-size: 11.5px; color: #6b8496;
          font-variant-numeric: tabular-nums;
        }
        #sc-preview .sc-compare-meta strong { color: #0c1f2e; font-weight: 600; }
        #sc-preview .sc-compare-delta { font-weight: 650; color: #1f7a45; }
        #sc-preview .sc-compare-frame {
          position: relative; width: 100%; aspect-ratio: 4 / 3; max-height: 240px;
          overflow: hidden; border-radius: 10px; border: 1px solid rgba(12,31,46,.1);
          background: rgba(12,31,46,.04); touch-action: none; user-select: none;
        }
        #sc-preview .sc-compare-img {
          display: block; width: 100%; height: 100%; object-fit: contain; background: #fff; pointer-events: none;
        }
        #sc-preview .sc-compare-after { position: absolute; inset: 0; }
        #sc-preview .sc-compare-before-wrap {
          position: absolute; inset: 0 auto 0 0; overflow: hidden;
          border-right: 2px solid #fff; box-shadow: 2px 0 0 rgba(12,31,46,.12);
        }
        #sc-preview .sc-compare-before {
          position: absolute; inset: 0 auto 0 0; max-width: none; height: 100%;
        }
        #sc-preview .sc-compare-handle {
          position: absolute; top: 0; bottom: 0; width: 28px; margin-left: -14px;
          display: flex; align-items: center; justify-content: center; cursor: ew-resize; z-index: 2;
        }
        #sc-preview .sc-compare-handle-bar {
          position: absolute; top: 0; bottom: 0; width: 2px; background: #fff;
          box-shadow: 0 0 0 1px rgba(12,31,46,.18);
        }
        #sc-preview .sc-compare-handle-knob {
          width: 22px; height: 22px; border-radius: 50%; background: #146B63;
          border: 2px solid #fff; box-shadow: 0 2px 8px rgba(12,31,46,.28); position: relative; z-index: 1;
        }
        #sc-preview .sc-compare-range {
          position: absolute; left: 0; right: 0; bottom: 6px; width: calc(100% - 16px);
          margin: 0 8px; z-index: 3; accent-color: #146B63;
        }
        #sc-preview .sc-compare-labels {
          position: absolute; top: 8px; left: 8px; right: 8px; display: flex;
          justify-content: space-between; pointer-events: none; z-index: 2;
        }
        #sc-preview .sc-compare-labels span {
          font-size: 10px; font-weight: 650; letter-spacing: .04em; text-transform: uppercase;
          color: #fff; background: rgba(12,31,46,.55); padding: 3px 7px; border-radius: 6px;
        }
        #sc-preview .sc-compare-single {
          border-radius: 10px; overflow: hidden; border: 1px solid rgba(12,31,46,.1);
          background: #fff; max-height: 200px;
        }
        #sc-preview .sc-compare-single img {
          display: block; width: 100%; max-height: 200px; object-fit: contain;
        }
        #sc-preview .sc-compare-hint { margin: 0; font-size: 11.5px; line-height: 1.4; color: #6b8496; }
      `;
      root.appendChild(style);
      panel = document.createElement("div");
      panel.id = "sc-preview";
      panel.className = "hidden";
      panel.innerHTML = `
        <div class="card" role="dialog" aria-modal="true" aria-labelledby="sc-title">
          <div class="brand">
            <img alt="" width="28" height="28" />
            <h2 id="sc-title">Confirm before upload</h2>
          </div>
          <p class="body" id="sc-body"></p>
          <div class="mount" id="sc-mount"></div>
          <div class="row">
            <button type="button" class="ghost" id="sc-decline">Keep original</button>
            <button type="button" class="primary" id="sc-accept">Upload new file</button>
          </div>
        </div>`;
      panel.querySelector("img").src = chrome.runtime.getURL("icons/icon48.png");
      root.appendChild(panel);
    }

    revokePreviewUrls();
    const Compare = globalThis.SwiftConvertCompare;
    const mount = panel.querySelector("#sc-mount");
    if (Compare && mount) Compare.destroy(mount);

    const beforeType = payload.originalType || "";
    const afterType = payload.convertedType || "";
    const canBefore =
      payload.originalBytes &&
      beforeType.startsWith("image/") &&
      beforeType !== "image/heic" &&
      beforeType !== "image/heif";
    const canAfter = payload.convertedBytes && afterType.startsWith("image/");
    previewBeforeUrl = canBefore
      ? bytesToObjectUrl(payload.originalBytes, beforeType)
      : null;
    previewAfterUrl = canAfter
      ? bytesToObjectUrl(payload.convertedBytes, afterType)
      : null;

    panel.dataset.id = String(payload.id);
    const action =
      payload.didConvert && payload.didCompress
        ? "converted & compressed"
        : payload.didCompress
          ? "compressed"
          : "converted";
    panel.querySelector("#sc-body").textContent =
      `${payload.originalName} → ${payload.convertedName} (${action})`;
    panel.querySelector("#sc-accept").textContent = payload.didCompress
      ? "Upload new file"
      : "Upload converted";

    let note = "";
    if (!previewBeforeUrl && !previewAfterUrl) {
      note =
        "No visual wipe for this type (e.g. PDF/DOCX text). Check sizes and formats, then Accept or Keep original.";
    } else if (!previewBeforeUrl) {
      note = "Original is not browser-viewable here; showing the result when possible.";
    }

    if (Compare && mount) {
      Compare.mount(mount, {
        title: "Before / after",
        beforeUrl: previewBeforeUrl,
        afterUrl: previewAfterUrl,
        beforeType,
        afterType,
        beforeSize: payload.originalSize,
        afterSize: payload.convertedSize,
        beforeName: payload.originalName,
        afterName: payload.convertedName,
        note: note || undefined
      });
    } else if (mount) {
      mount.textContent =
        `${beforeType || "unknown"} → ${afterType}` +
        ` · ${(payload.originalSize / 1024).toFixed(1)} KB → ${(payload.convertedSize / 1024).toFixed(1)} KB`;
    }

    panel.classList.remove("hidden");

    const onKey = (e) => {
      if (e.key === "Escape" && !panel.classList.contains("hidden")) {
        finish(false);
      }
    };

    const finish = (accepted) => {
      panel.classList.add("hidden");
      document.removeEventListener("keydown", onKey, true);
      revokePreviewUrls();
      if (Compare && mount) Compare.destroy(mount);
      window.postMessage(
        {
          source: CHANNEL,
          direction: "bridge-to-page",
          type: "preview-result",
          payload: { id: payload.id, accepted }
        },
        "*"
      );
    };

    panel.querySelector("#sc-accept").onclick = () => finish(true);
    panel.querySelector("#sc-decline").onclick = () => finish(false);
    panel.onclick = (e) => {
      if (e.target === panel) finish(false);
    };
    document.addEventListener("keydown", onKey, true);
  }

  loadSettings().then(() => {
    sendSettingsToPage();
    scheduleBadgeRefresh();
  });
  const scheduleFallback = () => {
    if (isPageHooked()) {
      sendSettingsToPage();
      scheduleBadgeRefresh();
      return;
    }
    injectScriptsFallback();
  };
  scheduleFallback();
  setTimeout(scheduleFallback, 0);
  setTimeout(scheduleFallback, 100);
  setTimeout(scheduleFallback, 500);
})();
