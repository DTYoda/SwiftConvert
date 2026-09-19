/** Default SwiftConvert settings (shared shape for options + runtime). */
export const DEFAULT_SETTINGS = {
  enabled: true,
  previewBeforeUpload: false,
  preferredImageFormat: "auto", // auto | png | jpeg | webp
  showQuietBadge: true,
  /** Auto-compress oversized images on upload. */
  autoCompress: true,
  /**
   * Detect-first: when false (default), only compress when a page size limit
   * is inferred. When true, also apply defaultMaxSizeMB if no limit is found.
   */
  useDefaultMaxWhenNoLimit: false,
  /** Fallback max size in MiB when useDefaultMaxWhenNoLimit is on. */
  defaultMaxSizeMB: 2,
  /** Quality preference for auto + manual defaults: high | balanced | small */
  compressQuality: "balanced"
};

export function mergeSettings(raw) {
  return { ...DEFAULT_SETTINGS, ...(raw || {}) };
}
