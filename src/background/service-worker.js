/**
 * Background service worker — settings defaults + conversion telemetry badge.
 */
const DEFAULTS = {
  enabled: true,
  previewBeforeUpload: false,
  preferredImageFormat: "auto",
  showQuietBadge: false
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(null, (existing) => {
    const toSet = {};
    for (const [k, v] of Object.entries(DEFAULTS)) {
      if (existing[k] === undefined) toSet[k] = v;
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
