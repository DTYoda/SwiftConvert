const DEFAULTS = {
  enabled: true,
  previewBeforeUpload: false,
  preferredImageFormat: "auto",
  showQuietBadge: false
};

const fields = {
  enabled: document.getElementById("enabled"),
  previewBeforeUpload: document.getElementById("previewBeforeUpload"),
  showQuietBadge: document.getElementById("showQuietBadge"),
  preferredImageFormat: document.getElementById("preferredImageFormat")
};

const status = document.getElementById("status");
let statusTimer;

function readForm() {
  const data = {};
  if (fields.enabled) data.enabled = fields.enabled.checked;
  if (fields.previewBeforeUpload) data.previewBeforeUpload = fields.previewBeforeUpload.checked;
  if (fields.showQuietBadge) data.showQuietBadge = fields.showQuietBadge.checked;
  if (fields.preferredImageFormat) data.preferredImageFormat = fields.preferredImageFormat.value;
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
