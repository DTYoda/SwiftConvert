/** Default SwiftConvert settings (shared shape for options + runtime). */
export const DEFAULT_SETTINGS = {
  enabled: true,
  previewBeforeUpload: false,
  preferredImageFormat: "auto", // auto | png | jpeg | webp
  showQuietBadge: false
};

export function mergeSettings(raw) {
  return { ...DEFAULT_SETTINGS, ...(raw || {}) };
}
