/**
 * Before/after compare panel with wipe/reveal slider (images)
 * or best-effort fallback for non-image results.
 * Classic script → globalThis.SwiftConvertCompare
 */
(function (global) {
  const api = {};

  function fmtBytes(n) {
    if (!(n >= 0)) return "—";
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(2) + " MB";
  }

  function shortType(t) {
    if (!t) return "unknown";
    if (t === "image/jpeg") return "JPEG";
    if (t === "image/png") return "PNG";
    if (t === "image/webp") return "WebP";
    if (t === "image/heic" || t === "image/heif") return "HEIC";
    if (t === "application/pdf") return "PDF";
    if (t === "text/plain") return "TXT";
    if (t === "text/html") return "HTML";
    if (t.includes("wordprocessingml")) return "DOCX";
    return t.split("/").pop() || t;
  }

  /**
   * @param {HTMLElement} container
   * @param {{
   *   beforeUrl?: string | null,
   *   afterUrl?: string | null,
   *   beforeType?: string,
   *   afterType?: string,
   *   beforeSize?: number,
   *   afterSize?: number,
   *   beforeName?: string,
   *   afterName?: string,
   *   note?: string,
   *   title?: string
   * }} opts
   */
  function mount(container, opts) {
    if (!container) return null;
    destroy(container);

    const beforeUrl = opts.beforeUrl || null;
    const afterUrl = opts.afterUrl || null;
    const canBefore = Boolean(beforeUrl);
    const canAfter = Boolean(afterUrl);
    const useSlider = canBefore && canAfter;

    const root = document.createElement("div");
    root.className = "sc-compare";
    root.setAttribute("data-sc-compare", "1");

    const title = document.createElement("div");
    title.className = "sc-compare-title";
    title.textContent = opts.title || "Before / after";
    root.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "sc-compare-meta";
    const beforeBits = [
      shortType(opts.beforeType),
      opts.beforeSize != null ? fmtBytes(opts.beforeSize) : null,
      opts.beforeName || null
    ].filter(Boolean);
    const afterBits = [
      shortType(opts.afterType),
      opts.afterSize != null ? fmtBytes(opts.afterSize) : null,
      opts.afterName || null
    ].filter(Boolean);
    meta.innerHTML =
      `<span class="sc-compare-meta-before"><strong>Before</strong> ${escapeHtml(beforeBits.join(" · "))}</span>` +
      `<span class="sc-compare-meta-after"><strong>After</strong> ${escapeHtml(afterBits.join(" · "))}</span>`;
    if (
      opts.beforeSize != null &&
      opts.afterSize != null &&
      opts.beforeSize > 0 &&
      opts.afterSize !== opts.beforeSize
    ) {
      const pct = Math.round((1 - opts.afterSize / opts.beforeSize) * 100);
      const delta = document.createElement("span");
      delta.className = "sc-compare-delta";
      delta.textContent =
        pct > 0 ? `−${pct}% size` : pct < 0 ? `+${Math.abs(pct)}% size` : "same size";
      meta.appendChild(delta);
    }
    root.appendChild(meta);

    if (useSlider) {
      root.appendChild(buildSlider(beforeUrl, afterUrl));
    } else if (canAfter || canBefore) {
      const single = document.createElement("div");
      single.className = "sc-compare-single";
      const img = document.createElement("img");
      img.alt = canAfter ? "After preview" : "Before preview";
      img.src = canAfter ? afterUrl : beforeUrl;
      single.appendChild(img);
      const hint = document.createElement("p");
      hint.className = "sc-compare-hint";
      hint.textContent = canAfter
        ? "Slider unavailable for the original — showing result preview."
        : "Result is not an image — showing original preview only.";
      root.appendChild(single);
      root.appendChild(hint);
    } else {
      const hint = document.createElement("p");
      hint.className = "sc-compare-hint";
      hint.textContent =
        opts.note ||
        "No visual preview for this file type (e.g. PDF/DOCX text). Check sizes and formats above.";
      root.appendChild(hint);
    }

    if (opts.note && (useSlider || canAfter || canBefore)) {
      const note = document.createElement("p");
      note.className = "sc-compare-hint";
      note.textContent = opts.note;
      root.appendChild(note);
    }

    container.appendChild(root);
    container.classList.add("sc-compare-host");
    return root;
  }

  function buildSlider(beforeUrl, afterUrl) {
    const frame = document.createElement("div");
    frame.className = "sc-compare-frame";
    frame.setAttribute("role", "img");
    frame.setAttribute("aria-label", "Before and after comparison. Drag slider to reveal.");

    const afterImg = document.createElement("img");
    afterImg.className = "sc-compare-img sc-compare-after";
    afterImg.alt = "After";
    afterImg.src = afterUrl;
    afterImg.draggable = false;

    const beforeWrap = document.createElement("div");
    beforeWrap.className = "sc-compare-before-wrap";
    beforeWrap.style.width = "50%";

    const beforeImg = document.createElement("img");
    beforeImg.className = "sc-compare-img sc-compare-before";
    beforeImg.alt = "Before";
    beforeImg.src = beforeUrl;
    beforeImg.draggable = false;
    beforeWrap.appendChild(beforeImg);

    const handle = document.createElement("div");
    handle.className = "sc-compare-handle";
    handle.style.left = "50%";
    handle.innerHTML = `<span class="sc-compare-handle-bar"></span><span class="sc-compare-handle-knob" aria-hidden="true"></span>`;

    const range = document.createElement("input");
    range.type = "range";
    range.className = "sc-compare-range";
    range.min = "0";
    range.max = "100";
    range.value = "50";
    range.setAttribute("aria-label", "Reveal after image");

    const labels = document.createElement("div");
    labels.className = "sc-compare-labels";
    labels.innerHTML = `<span>Before</span><span>After</span>`;

    function setPos(pct) {
      const p = Math.max(0, Math.min(100, Number(pct) || 0));
      beforeWrap.style.width = p + "%";
      handle.style.left = p + "%";
      range.value = String(Math.round(p));
    }

    range.addEventListener("input", () => setPos(range.value));

    let dragging = false;
    function posFromEvent(e) {
      const rect = frame.getBoundingClientRect();
      const x = (e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX) - rect.left;
      return (x / rect.width) * 100;
    }
    function onMove(e) {
      if (!dragging) return;
      e.preventDefault();
      setPos(posFromEvent(e));
    }
    function onUp() {
      dragging = false;
    }
    handle.addEventListener("pointerdown", (e) => {
      dragging = true;
      handle.setPointerCapture?.(e.pointerId);
      setPos(posFromEvent(e));
    });
    frame.addEventListener("pointerdown", (e) => {
      if (e.target === range) return;
      dragging = true;
      setPos(posFromEvent(e));
    });
    frame.addEventListener("pointermove", onMove);
    frame.addEventListener("pointerup", onUp);
    frame.addEventListener("pointercancel", onUp);

    // Keep before image sized to full frame so wipe reveals correctly
    function syncBeforeWidth() {
      const w = frame.clientWidth;
      if (w > 0) beforeImg.style.width = w + "px";
    }
    afterImg.addEventListener("load", syncBeforeWidth);
    beforeImg.addEventListener("load", syncBeforeWidth);
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(syncBeforeWidth);
      ro.observe(frame);
      frame._scRo = ro;
    } else {
      window.addEventListener("resize", syncBeforeWidth);
      frame._scOnResize = syncBeforeWidth;
    }

    frame.appendChild(afterImg);
    frame.appendChild(beforeWrap);
    frame.appendChild(handle);
    frame.appendChild(range);
    frame.appendChild(labels);
    return frame;
  }

  function destroy(container) {
    if (!container) return;
    const existing = container.querySelector("[data-sc-compare]");
    if (existing) {
      const frame = existing.querySelector(".sc-compare-frame");
      if (frame && frame._scRo) frame._scRo.disconnect();
      if (frame && frame._scOnResize) {
        window.removeEventListener("resize", frame._scOnResize);
      }
      existing.remove();
    }
    container.classList.remove("sc-compare-host");
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  api.mount = mount;
  api.destroy = destroy;
  api.fmtBytes = fmtBytes;
  api.shortType = shortType;

  global.SwiftConvertCompare = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
