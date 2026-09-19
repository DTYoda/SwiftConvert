/**
 * Infer upload size limits from file inputs, data attributes, nearby copy,
 * and common form / XHR hint attributes.
 */
(function (root) {
  const SIZE_ATTRS = [
    "data-max-size",
    "data-maxfilesize",
    "data-max-filesize",
    "data-max-file-size",
    "data-maxsize",
    "data-filesize-max",
    "data-file-max-size",
    "data-max",
    "max-size",
    "maxsize",
    "maxfilesize"
  ];

  const TEXT_RE =
    /(?:max(?:imum)?(?:\s+upload)?(?:\s+file)?(?:\s+size)?|upload\s+(?:size\s+)?limit|file\s+size\s+limit|size\s+limit|up\s*to|limit(?:ed)?\s+to|no\s+more\s+than|must\s+be\s+(?:under|below)|≤|<=)\s*[:=]?\s*([\d.,]+)\s*(k(?:ilo)?b(?:ytes?)?|m(?:ega)?b(?:ytes?)?|g(?:iga)?b(?:ytes?)?|b(?:ytes?)?)/gi;

  function parseNumber(raw) {
    const n = parseFloat(String(raw).replace(/,/g, ""));
    return Number.isFinite(n) ? n : NaN;
  }

  function unitMultiplier(unit) {
    const u = String(unit || "").toLowerCase().replace(/ilo|ega|iga|ytes?/g, "");
    if (u.startsWith("g")) return 1024 * 1024 * 1024;
    if (u.startsWith("m")) return 1024 * 1024;
    if (u.startsWith("k")) return 1024;
    return 1;
  }

  /** Parse "2MB", "500 KB", "102400", "2e6" → bytes (or null). */
  function parseSizeToBytes(value) {
    if (value == null || value === "") return null;
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return Math.floor(value);
    }
    const s = String(value).trim();
    if (!s) return null;

    const withUnit = s.match(
      /^([\d.,]+)\s*(k(?:ilo)?b(?:ytes?)?|m(?:ega)?b(?:ytes?)?|g(?:iga)?b(?:ytes?)?|b(?:ytes?)?)?$/i
    );
    if (withUnit) {
      const n = parseNumber(withUnit[1]);
      if (!Number.isFinite(n) || n <= 0) return null;
      const mult = withUnit[2] ? unitMultiplier(withUnit[2]) : 1;
      // Bare numbers ≥ 1024 are treated as bytes; smaller bare numbers are ambiguous — treat as bytes.
      return Math.floor(n * mult);
    }

    const n = parseNumber(s);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
    return null;
  }

  function bytesFromAttrs(el) {
    if (!el || !el.getAttribute) return null;
    for (const name of SIZE_ATTRS) {
      const raw = el.getAttribute(name);
      if (raw == null || raw === "") continue;
      const bytes = parseSizeToBytes(raw);
      if (bytes) return { bytes, source: "attr:" + name };
    }
    // HTML max on number-like custom attrs sometimes used as bytes
    if (el.hasAttribute("max") && el.type !== "file") {
      /* skip non-file */
    }
    if (el instanceof HTMLInputElement && el.type === "file" && el.hasAttribute("max")) {
      const bytes = parseSizeToBytes(el.getAttribute("max"));
      if (bytes) return { bytes, source: "attr:max" };
    }
    return null;
  }

  function textFromNode(node, maxLen) {
    if (!node) return "";
    try {
      const t = (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim();
      return t.slice(0, maxLen || 800);
    } catch {
      return "";
    }
  }

  function scanTextForLimit(text) {
    if (!text) return null;
    let best = null;
    TEXT_RE.lastIndex = 0;
    let m;
    while ((m = TEXT_RE.exec(text))) {
      const n = parseNumber(m[1]);
      if (!Number.isFinite(n) || n <= 0) continue;
      const bytes = Math.floor(n * unitMultiplier(m[2]));
      if (!best || bytes < best.bytes) {
        best = { bytes, source: "copy" };
      }
    }
    return best;
  }

  function nearbyCopyLimit(el) {
    if (!el || !el.closest) return null;
    const scopes = [];
    const label =
      (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) ||
      el.closest("label");
    if (label) scopes.push(label);
    const field =
      el.closest(
        ".field, .form-group, .form-field, .upload, .uploader, .dropzone, .drop-zone, [data-accept], section, article, li, td, .row, .control"
      ) || el.parentElement;
    if (field) scopes.push(field);
    if (el.parentElement && el.parentElement !== field) scopes.push(el.parentElement);
    const form = el.closest("form");
    if (form) scopes.push(form);

    for (const scope of scopes) {
      const hit = scanTextForLimit(textFromNode(scope, 1200));
      if (hit) return hit;
    }
    return null;
  }

  /**
   * @param {object} ctx
   * @param {HTMLInputElement} [ctx.input]
   * @param {Element} [ctx.target]
   * @param {Element} [ctx.dropHost]
   * @param {string} [ctx.accept]
   * @returns {{ bytes: number, source: string } | null}
   */
  function inferMaxBytes(ctx) {
    const nodes = [];
    if (ctx) {
      if (ctx.input) nodes.push(ctx.input);
      if (ctx.dropHost) nodes.push(ctx.dropHost);
      if (ctx.target && ctx.target !== ctx.input) nodes.push(ctx.target);
    }

    for (const node of nodes) {
      const fromAttr = bytesFromAttrs(node);
      if (fromAttr) return fromAttr;
    }

    for (const node of nodes) {
      const fromCopy = nearbyCopyLimit(node);
      if (fromCopy) return fromCopy;
    }

    // Form-level hints
    for (const node of nodes) {
      const form = node && node.closest && node.closest("form");
      if (!form) continue;
      const fromForm = bytesFromAttrs(form);
      if (fromForm) return fromForm;
      const formCopy = scanTextForLimit(textFromNode(form, 2000));
      if (formCopy) return formCopy;
    }

    return null;
  }

  /**
   * Resolve effective max bytes from page context + settings.
   * Detect-first: prefer inferred limits; optional default only when enabled.
   */
  function resolveMaxBytes(ctx, settings) {
    const inferred = inferMaxBytes(ctx || {});
    if (inferred && inferred.bytes > 0) return inferred;

    if (
      settings &&
      settings.autoCompress &&
      settings.useDefaultMaxWhenNoLimit &&
      settings.defaultMaxSizeMB > 0
    ) {
      return {
        bytes: Math.floor(Number(settings.defaultMaxSizeMB) * 1024 * 1024),
        source: "default"
      };
    }
    return null;
  }

  root.SwiftConvertSizeLimit = {
    parseSizeToBytes,
    inferMaxBytes,
    resolveMaxBytes,
    scanTextForLimit
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
