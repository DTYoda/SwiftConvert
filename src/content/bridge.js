/**
 * Content-script bridge: injects page-world scripts, syncs settings,
 * and hosts the optional preview overlay (isolated world / shadow DOM).
 */
(function () {
  if (window.__SWIFTCONVERT_BRIDGE__) return;
  window.__SWIFTCONVERT_BRIDGE__ = true;

  const CHANNEL = "swiftconvert";
  const DEFAULTS = {
    enabled: true,
    previewBeforeUpload: false,
    preferredImageFormat: "auto",
    showQuietBadge: false
  };

  let settings = { ...DEFAULTS };
  let host = null;
  let shadow = null;
  let quietTimer = null;

  const PAGE_SCRIPTS = [
    "src/lib/mime.js",
    "src/lib/converters/image.js",
    "src/lib/converters/stubs.js",
    "src/lib/converters/registry.js",
    "src/content/page-hook.js"
  ];

  function injectScripts() {
    // Inject sequentially to preserve dependency order
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
    return chain.catch((err) => console.warn("[SwiftConvert]", err));
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
    if (changed) sendSettingsToPage();
  });

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== CHANNEL || data.direction !== "page-to-bridge") return;

    switch (data.type) {
      case "ready":
      case "hooked":
        sendSettingsToPage();
        break;
      case "preview":
        showPreview(data.payload);
        break;
      case "converted-quiet":
        showQuietToast(data.payload);
        break;
      case "converted":
        // Optional: could badge the extension icon via runtime message
        chrome.runtime.sendMessage({ type: "converted", payload: data.payload }).catch(() => {});
        break;
      case "error":
        console.warn("[SwiftConvert]", data.payload && data.payload.message);
        break;
      case "skip":
        break;
      default:
        break;
    }
  });

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
    shadow = host.attachShadow({ mode: "closed" });
    document.documentElement.appendChild(host);
    return shadow;
  }

  function showQuietToast(payload) {
    if (!settings.showQuietBadge) return;
    const root = ensureHost();
    let toast = root.getElementById("sc-toast");
    if (!toast) {
      const style = document.createElement("style");
      style.textContent = `
        #sc-toast {
          position: fixed; right: 16px; bottom: 16px;
          font: 13px/1.4 ui-sans-serif, system-ui, sans-serif;
          background: #0f172a; color: #f8fafc;
          padding: 10px 14px; border-radius: 8px;
          box-shadow: 0 8px 24px rgba(15,23,42,.25);
          opacity: 0; transform: translateY(8px);
          transition: opacity .2s, transform .2s;
          max-width: 280px; pointer-events: none;
        }
        #sc-toast.show { opacity: 1; transform: translateY(0); }
      `;
      root.appendChild(style);
      toast = document.createElement("div");
      toast.id = "sc-toast";
      root.appendChild(toast);
    }
    toast.textContent = `Converted ${payload.from} → ${payload.to}`;
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
          background: rgba(15, 23, 42, 0.45); font: 14px/1.45 "Segoe UI", ui-sans-serif, system-ui, sans-serif;
        }
        #sc-preview .card {
          background: #fff; color: #0f172a; width: min(420px, calc(100vw - 32px));
          border-radius: 12px; padding: 20px 22px; box-shadow: 0 20px 50px rgba(15,23,42,.28);
        }
        #sc-preview h2 { margin: 0 0 6px; font-size: 17px; font-weight: 650; }
        #sc-preview p { margin: 0 0 14px; color: #475569; }
        #sc-preview .meta { font-size: 12px; color: #64748b; margin-bottom: 16px; }
        #sc-preview .row { display: flex; gap: 8px; justify-content: flex-end; }
        #sc-preview button {
          border: 0; border-radius: 8px; padding: 8px 14px; font: inherit; cursor: pointer;
        }
        #sc-preview .ghost { background: #e2e8f0; color: #0f172a; }
        #sc-preview .primary { background: #2563eb; color: #fff; }
        #sc-preview.hidden { display: none; }
      `;
      root.appendChild(style);
      panel = document.createElement("div");
      panel.id = "sc-preview";
      panel.className = "hidden";
      panel.innerHTML = `
        <div class="card" role="dialog" aria-modal="true" aria-labelledby="sc-title">
          <h2 id="sc-title">Confirm conversion</h2>
          <p id="sc-body"></p>
          <div class="meta" id="sc-meta"></div>
          <div class="row">
            <button type="button" class="ghost" id="sc-decline">Keep original</button>
            <button type="button" class="primary" id="sc-accept">Upload converted</button>
          </div>
        </div>`;
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

  // Boot
  injectScripts();
  loadSettings().then(sendSettingsToPage);
})();
