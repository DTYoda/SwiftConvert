const DEFAULTS = {
  previewBeforeUpload: false,
  preferredImageFormat: "auto",
  showQuietBadge: true,
  showFieldBadge: true,
  autoConvert: true,
  autoCompress: true,
  useDefaultMaxWhenNoLimit: false,
  defaultMaxSizeMB: 2,
  compressQuality: "balanced"
};

const fields = {
  previewBeforeUpload: document.getElementById("previewBeforeUpload"),
  showQuietBadge: document.getElementById("showQuietBadge"),
  showFieldBadge: document.getElementById("showFieldBadge"),
  preferredImageFormat: document.getElementById("preferredImageFormat"),
  autoConvert: document.getElementById("autoConvert"),
  autoCompress: document.getElementById("autoCompress"),
  useDefaultMaxWhenNoLimit: document.getElementById("useDefaultMaxWhenNoLimit"),
  defaultMaxSizeMB: document.getElementById("defaultMaxSizeMB"),
  compressQuality: document.getElementById("compressQuality")
};

const status = document.getElementById("status");
let statusTimer;

function readForm() {
  const data = {};
  if (fields.previewBeforeUpload) data.previewBeforeUpload = fields.previewBeforeUpload.checked;
  if (fields.showQuietBadge) data.showQuietBadge = fields.showQuietBadge.checked;
  if (fields.showFieldBadge) data.showFieldBadge = fields.showFieldBadge.checked;
  if (fields.preferredImageFormat) data.preferredImageFormat = fields.preferredImageFormat.value;
  if (fields.autoConvert) data.autoConvert = fields.autoConvert.checked;
  if (fields.autoCompress) data.autoCompress = fields.autoCompress.checked;
  if (fields.useDefaultMaxWhenNoLimit) {
    data.useDefaultMaxWhenNoLimit = fields.useDefaultMaxWhenNoLimit.checked;
  }
  if (fields.defaultMaxSizeMB) {
    const n = Number(fields.defaultMaxSizeMB.value);
    data.defaultMaxSizeMB = Number.isFinite(n) && n > 0 ? n : DEFAULTS.defaultMaxSizeMB;
  }
  if (fields.compressQuality) data.compressQuality = fields.compressQuality.value;
  return data;
}

function writeForm(data) {
  if (fields.previewBeforeUpload) {
    fields.previewBeforeUpload.checked = Boolean(data.previewBeforeUpload);
  }
  if (fields.showQuietBadge) fields.showQuietBadge.checked = data.showQuietBadge !== false;
  if (fields.showFieldBadge) fields.showFieldBadge.checked = data.showFieldBadge !== false;
  if (fields.preferredImageFormat) {
    fields.preferredImageFormat.value = data.preferredImageFormat || "auto";
  }
  if (fields.autoConvert) fields.autoConvert.checked = data.autoConvert !== false;
  if (fields.autoCompress) fields.autoCompress.checked = data.autoCompress !== false;
  if (fields.useDefaultMaxWhenNoLimit) {
    fields.useDefaultMaxWhenNoLimit.checked = Boolean(data.useDefaultMaxWhenNoLimit);
  }
  if (fields.defaultMaxSizeMB) {
    fields.defaultMaxSizeMB.value =
      data.defaultMaxSizeMB != null ? data.defaultMaxSizeMB : DEFAULTS.defaultMaxSizeMB;
  }
  if (fields.compressQuality) {
    fields.compressQuality.value = data.compressQuality || "balanced";
  }
}

function flashSaved() {
  if (!status) return;
  status.hidden = false;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    status.hidden = true;
  }, 1200);
}

function save() {
  chrome.storage.sync.set(readForm(), flashSaved);
}

chrome.storage.sync.get(DEFAULTS, (data) => {
  writeForm({ ...DEFAULTS, ...data });
});

for (const el of Object.values(fields)) {
  if (!el) continue;
  el.addEventListener("change", save);
}

/** Settings / Tools page navigation (popup + options). */
(function initPageNav() {
  const buttons = document.querySelectorAll("[data-page-nav]");
  const pages = document.querySelectorAll("[data-page]");
  if (!buttons.length || !pages.length) return;

  function showPage(name) {
    const target = name === "tools" ? "tools" : "settings";
    pages.forEach((page) => {
      const match = page.getAttribute("data-page") === target;
      page.hidden = !match;
      page.classList.toggle("is-active", match);
    });
    buttons.forEach((btn) => {
      const match = btn.getAttribute("data-page-nav") === target;
      btn.classList.toggle("is-active", match);
      btn.setAttribute("aria-selected", match ? "true" : "false");
    });
    try {
      if (location.hash.replace(/^#/, "") !== target) {
        history.replaceState(null, "", "#" + target);
      }
    } catch (_) {
      /* ignore */
    }
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => showPage(btn.getAttribute("data-page-nav")));
  });

  const fromHash = (location.hash || "").replace(/^#/, "");
  showPage(fromHash === "tools" || fromHash === "compress" ? "tools" : "settings");
  window.addEventListener("hashchange", () => {
    const h = (location.hash || "").replace(/^#/, "");
    showPage(h === "tools" || h === "compress" ? "tools" : "settings");
  });
})();
