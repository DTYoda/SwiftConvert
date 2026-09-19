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

const fields = {
  enabled: document.getElementById("enabled"),
  previewBeforeUpload: document.getElementById("previewBeforeUpload"),
  showQuietBadge: document.getElementById("showQuietBadge"),
  preferredImageFormat: document.getElementById("preferredImageFormat"),
  autoCompress: document.getElementById("autoCompress"),
  useDefaultMaxWhenNoLimit: document.getElementById("useDefaultMaxWhenNoLimit"),
  defaultMaxSizeMB: document.getElementById("defaultMaxSizeMB"),
  compressQuality: document.getElementById("compressQuality")
};

const status = document.getElementById("status");
const detailPanel = document.getElementById("detailPanel");
let statusTimer;

function readForm() {
  const data = {};
  if (fields.enabled) data.enabled = fields.enabled.checked;
  if (fields.previewBeforeUpload) data.previewBeforeUpload = fields.previewBeforeUpload.checked;
  if (fields.showQuietBadge) data.showQuietBadge = fields.showQuietBadge.checked;
  if (fields.preferredImageFormat) data.preferredImageFormat = fields.preferredImageFormat.value;
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
  if (fields.enabled) fields.enabled.checked = Boolean(data.enabled);
  if (fields.previewBeforeUpload) {
    fields.previewBeforeUpload.checked = Boolean(data.previewBeforeUpload);
  }
  if (fields.showQuietBadge) fields.showQuietBadge.checked = Boolean(data.showQuietBadge);
  if (fields.preferredImageFormat) {
    fields.preferredImageFormat.value = data.preferredImageFormat || "auto";
  }
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
  syncDetailState();
}

function syncDetailState() {
  if (!detailPanel || !fields.enabled) return;
  detailPanel.classList.toggle("dimmed", !fields.enabled.checked);
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
  syncDetailState();
  chrome.storage.sync.set(readForm(), flashSaved);
}

chrome.storage.sync.get(DEFAULTS, (data) => {
  writeForm({ ...DEFAULTS, ...data });
});

for (const el of Object.values(fields)) {
  if (!el) continue;
  el.addEventListener("change", save);
}
