/**
 * Background service worker — settings defaults + conversion telemetry badge.
 */
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

const SETTINGS_SCHEMA_VERSION = 4;

chrome.runtime.onInstalled.addListener((details) => {
  chrome.storage.sync.get(null, (existing) => {
    const toSet = {};
    for (const [k, v] of Object.entries(DEFAULTS)) {
      if (existing[k] === undefined) toSet[k] = v;
    }
    // One-time: quiet toast became ON by default in v0.1.3. Enable it when
    // upgrading from a build that still had the old false default stored,
    // unless the user already bumped settingsSchemaVersion (they chose).
    if (
      details.reason === "update" &&
      existing.settingsSchemaVersion == null &&
      existing.showQuietBadge === false
    ) {
      toSet.showQuietBadge = true;
    }
    // v0.3.6: remove master "enabled" switch. Preserve prior off-state by
    // turning off auto-convert, auto-compress, and field badges.
    if (
      details.reason === "update" &&
      (existing.settingsSchemaVersion == null || existing.settingsSchemaVersion < 4) &&
      existing.enabled === false
    ) {
      toSet.autoConvert = false;
      toSet.autoCompress = false;
      toSet.showFieldBadge = false;
    }
    if (existing.settingsSchemaVersion == null || existing.settingsSchemaVersion < SETTINGS_SCHEMA_VERSION) {
      toSet.settingsSchemaVersion = SETTINGS_SCHEMA_VERSION;
    }
    if (Object.keys(toSet).length) chrome.storage.sync.set(toSet);
  });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "converted") {
    // Brief badge pulse
    chrome.action.setBadgeBackgroundColor({ color: "#2563eb" });
    chrome.action.setBadgeText({ text: "✓" });
    setTimeout(() => chrome.action.setBadgeText({ text: "" }), 1500);
    sendResponse({ ok: true });
    return true;
  }
  if (msg && msg.type === "get-settings") {
    chrome.storage.sync.get(DEFAULTS, (data) => sendResponse(data));
    return true;
  }
  return false;
});
