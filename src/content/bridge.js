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
    showQuietBadge: true
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
    "src/lib/converters/pdf-write.js",
    "src/lib/converters/stubs.js",
    "src/lib/converters/registry.js",
    "src/content/page-hook.js"
  ];

  const LOGO_URL = chrome.runtime.getURL("icons/icon16.png");

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
      toast.querySelector("img").src = chrome.runtime.getURL("icons/icon32.png");
      root.appendChild(toast);
    }
    toast.querySelector("span").textContent = `Converted ${payload.from} → ${payload.to}`;
    toast.classList.add("show");
    clearTimeout(quietTimer);
    quietTimer = setTimeout(() => toast.classList.remove("show"), 2200);
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
        }
        #sc-preview .card {
          background: linear-gradient(180deg, #ffffff 0%, #f3faf8 100%);
          color: #0c1f2e; width: min(420px, calc(100vw - 32px));
          border-radius: 14px; padding: 20px 22px;
          box-shadow: 0 22px 55px rgba(12,31,46,.3);
          border: 1px solid rgba(20, 107, 99, 0.12);
        }
        #sc-preview .brand {
          display: flex; align-items: center; gap: 10px; margin-bottom: 12px;
        }
        #sc-preview .brand img { width: 28px; height: 28px; border-radius: 7px; }
        #sc-preview h2 { margin: 0; font-size: 17px; font-weight: 650; letter-spacing: -0.02em; }
        #sc-preview p { margin: 0 0 10px; color: #3d5566; }
        #sc-preview .meta { font-size: 12px; color: #6b8496; margin-bottom: 16px; }
        #sc-preview .row { display: flex; gap: 8px; justify-content: flex-end; }
        #sc-preview button {
          border: 0; border-radius: 9px; padding: 8px 14px; font: inherit; cursor: pointer;
        }
        #sc-preview .ghost { background: #e2ece9; color: #0c1f2e; }
        #sc-preview .primary { background: #146B63; color: #fff; }
        #sc-preview.hidden { display: none; }
      `;
      root.appendChild(style);
      panel = document.createElement("div");
      panel.id = "sc-preview";
      panel.className = "hidden";
      panel.innerHTML = `
        <div class="card" role="dialog" aria-modal="true" aria-labelledby="sc-title">
          <div class="brand">
            <img alt="" width="28" height="28" />
            <h2 id="sc-title">Confirm conversion</h2>
          </div>
          <p id="sc-body"></p>
          <div class="meta" id="sc-meta"></div>
          <div class="row">
            <button type="button" class="ghost" id="sc-decline">Keep original</button>
            <button type="button" class="primary" id="sc-accept">Upload converted</button>
          </div>
        </div>`;
      panel.querySelector("img").src = chrome.runtime.getURL("icons/icon32.png");
      root.appendChild(panel);
    }

    panel.dataset.id = String(payload.id);
    panel.querySelector("#sc-body").textContent =
      `${payload.originalName} → ${payload.convertedName}`;
    panel.querySelector("#sc-meta").textContent =
      `${payload.originalType || "unknown"} → ${payload.convertedType}` +
      ` · ${(payload.originalSize / 1024).toFixed(1)} KB → ${(payload.convertedSize / 1024).toFixed(1)} KB`;
    panel.classList.remove("hidden");

    const finish = (accepted) => {
      panel.classList.add("hidden");
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
