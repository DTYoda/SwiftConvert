/**
 * SwiftConvert page-world hook.
 * Runs in the page context (not the isolated content-script world) so it can
 * patch File inputs, DataTransfer, FormData, fetch, and XHR used by any framework.
 *
 * Expects prior classic scripts to have defined:
 *   SwiftConvertMime, SwiftConvertImage, SwiftConvertStubs, SwiftConvertRegistry
 */
(function () {
  if (window.__SWIFTCONVERT_PAGE_HOOK__) return;
  window.__SWIFTCONVERT_PAGE_HOOK__ = true;

  const Mime = window.SwiftConvertMime;
  const Registry = window.SwiftConvertRegistry;
  const Compress = window.SwiftConvertCompress;
  const SizeLimit = window.SwiftConvertSizeLimit;

  const CHANNEL = "swiftconvert";
  let settings = {
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

  function autoPipelineActive() {
    return settings.autoConvert !== false || settings.autoCompress !== false;
  }

  function shortFormatLabel(mime) {
    if (!mime) return "file";
    const m = String(mime).toLowerCase();
    if (m === "image/png" || m === "png") return "PNG";
    if (m === "image/jpeg" || m === "image/jpg" || m === "jpeg" || m === "jpg") return "JPEG";
    if (m === "image/webp" || m === "webp") return "WebP";
    if (m === "application/pdf" || m === "pdf") return "PDF";
    if (m.includes("wordprocessingml") || m === "docx") return "DOCX";
    if (m === "text/plain") return "text";
    if (m === "text/html") return "HTML";
    const slash = m.lastIndexOf("/");
    return (slash >= 0 ? m.slice(slash + 1) : m).toUpperCase();
  }

  const pendingPreview = new Map();
  let previewSeq = 0;
  const pendingHostConvert = new Map();
  let hostConvertSeq = 0;

  /** @type {WeakMap<HTMLInputElement, string>} site accept before picker expansion */
  const savedAccept = new WeakMap();
  /** Inputs whose accept is temporarily expanded for an open/pending picker */
  const acceptExpandedForPicker = new WeakSet();

  function postToBridge(type, payload) {
    window.postMessage({ source: CHANNEL, direction: "page-to-bridge", type, payload }, "*");
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== CHANNEL || data.direction !== "bridge-to-page") return;

    if (data.type === "settings") {
      settings = { ...settings, ...data.payload };
      refreshCoverageMarks();
    }
    if (data.type === "preview-result") {
      const { id, accepted } = data.payload || {};
      const entry = pendingPreview.get(id);
      if (entry) {
        pendingPreview.delete(id);
        entry.resolve(Boolean(accepted));
      }
    }
    if (data.type === "convert-result") {
      const { id, ok, file, error } = data.payload || {};
      const entry = pendingHostConvert.get(id);
      if (entry) {
        pendingHostConvert.delete(id);
        if (ok && file) {
          entry.resolve(
            new File([file.bytes], file.name, {
              type: file.type || "",
              lastModified: file.lastModified || Date.now()
            })
          );
        } else {
          entry.reject(new Error(error || "Host conversion failed"));
        }
      }
    }
  });

  // Ask bridge for current settings
  postToBridge("ready", {});

  function markHooked() {
    try {
      document.documentElement.setAttribute("data-swiftconvert-hooked", "1");
    } catch (_) {
      /* ignore */
    }
  }
  markHooked();

  /** Mark upload controls SwiftConvert will handle (for the field badge). */
  function refreshCoverageMarks() {
    try {
      document.querySelectorAll("[data-swiftconvert-covered]").forEach((el) => {
        el.removeAttribute("data-swiftconvert-covered");
      });
      if (!autoPipelineActive()) {
        postToBridge("coverage", { count: 0 });
        return;
      }
      let count = 0;
      document.querySelectorAll('input[type="file"]').forEach((input) => {
        if (input.webkitdirectory || input.hasAttribute("webkitdirectory")) return;
        if (input.hasAttribute("capture")) return;
        const accept = effectiveAccept(input);
        if (!accept) return;
        input.setAttribute("data-swiftconvert-covered", "1");
        count += 1;
      });
      document.querySelectorAll("[data-accept]").forEach((el) => {
        if (el.getAttribute("data-swiftconvert-covered") === "1") return;
        const a = el.getAttribute("data-accept");
        if (!a || !String(a).trim()) return;
        el.setAttribute("data-swiftconvert-covered", "1");
        count += 1;
      });
      postToBridge("coverage", { count });
    } catch (_) {
      /* ignore */
    }
  }

  function acceptFromContext(ctx) {
    if (!ctx) return "";
    if (typeof ctx === "string") return ctx;
    if (ctx.input instanceof HTMLInputElement && savedAccept.has(ctx.input)) {
      return savedAccept.get(ctx.input);
    }
    if (ctx.accept) return ctx.accept;
    if (ctx.input && ctx.input.accept) return ctx.input.accept;
    return "";
  }

  function effectiveAccept(input) {
    if (!(input instanceof HTMLInputElement)) return "";
    if (savedAccept.has(input)) return savedAccept.get(input);
    return input.accept || "";
  }

  async function maybeConvertFile(file, ctx) {
    if (!file || !autoPipelineActive()) return file;
    const accept = acceptFromContext(ctx);
    const target =
      settings.autoConvert !== false
        ? Mime.inferTargetMime(file, accept, settings.preferredImageFormat)
        : null;

    let working = file;
    let didConvert = false;
    let didCompress = false;
    let compressMeta = null;
    let processing = false;
    const likelyCompress =
      settings.autoCompress !== false &&
      Compress &&
      SizeLimit &&
      Compress.canCompress(file) &&
      (() => {
        const limit = SizeLimit.resolveMaxBytes(ctx, settings);
        return Boolean(limit && limit.bytes > 0 && file.size > limit.bytes);
      })();

    const beginProcessing = (message) => {
      if (!processing) {
        processing = true;
        postToBridge("processing", { active: true, message: message || "Working…" });
      } else if (message) {
        postToBridge("processing", { active: true, message, refresh: true });
      }
    };
    const endProcessing = () => {
      if (!processing) return;
      processing = false;
      postToBridge("processing", { active: false });
    };

    try {
      if (settings.autoConvert !== false && target && Registry.canHandle(file, target)) {
        try {
          beginProcessing(
            likelyCompress
              ? `Converting ${file.name || "file"} to ${shortFormatLabel(target)} and compressing…`
              : `Converting ${file.name || "file"} to ${shortFormatLabel(target)}…`
          );
          if (Registry.needsHost && Registry.needsHost(file, target)) {
            working = await requestHostConvert(file, target);
          } else {
            working = await Registry.convertFile(file, target);
          }
          didConvert = working !== file;
        } catch (err) {
          postToBridge("error", { message: String(err && err.message ? err.message : err) });
          working = file;
        }
      } else if (settings.autoConvert !== false && target && !Registry.canHandle(file, target)) {
        postToBridge("skip", {
          reason: "no-converter",
          name: file.name,
          from: Mime.mimeFromFile(file),
          to: target
        });
      }

      // After format conversion (or if already matching), compress to fit size limits.
      if (settings.autoCompress && Compress && SizeLimit && Compress.canCompress(working)) {
        const limit = SizeLimit.resolveMaxBytes(ctx, settings);
        if (limit && limit.bytes > 0 && working.size > limit.bytes) {
          try {
            const compressLabel = working.name || file.name || "image";
            beginProcessing(`Compressing ${compressLabel}…`);
            const result = await Compress.compressImageToFit(working, limit.bytes, {
              qualityPref: settings.compressQuality || "balanced",
              mime: Mime.mimeFromFile(working)
            });
            if (result.compressed) {
              working = result.file;
              didCompress = true;
              compressMeta = {
                fromBytes: result.fromBytes,
                toBytes: result.toBytes,
                limitBytes: limit.bytes,
                limitSource: limit.source
              };
            }
          } catch (err) {
            postToBridge("error", {
              message: "Compress: " + String(err && err.message ? err.message : err)
            });
          }
        }
      }

      if (!didConvert && !didCompress) return file;

      // Work finished — hide spinner before preview/toast so it doesn't sit under the dialog.
      endProcessing();

      if (settings.previewBeforeUpload && (didConvert || didCompress)) {
        const ok = await requestPreview(file, working, target || Mime.mimeFromFile(working), {
          didConvert,
          didCompress
        });
        if (!ok) return file; // Cancel / dismiss / timeout → keep original
      } else if (settings.showQuietBadge) {
        if (didConvert && didCompress) {
          postToBridge("converted-quiet", {
            from: file.name,
            to: working.name,
            target: target || Mime.mimeFromFile(working),
            compressed: true,
            fromBytes: compressMeta && compressMeta.fromBytes,
            toBytes: compressMeta && compressMeta.toBytes
          });
        } else if (didConvert) {
          postToBridge("converted-quiet", {
            from: file.name,
            to: working.name,
            target
          });
        } else if (didCompress) {
          postToBridge("converted-quiet", {
            from: file.name,
            to: working.name,
            compressed: true,
            fromBytes: compressMeta && compressMeta.fromBytes,
            toBytes: compressMeta && compressMeta.toBytes
          });
        }
      }

      postToBridge("converted", {
        from: file.name,
        to: working.name,
        fromMime: Mime.mimeFromFile(file),
        toMime: Mime.mimeFromFile(working),
        compressed: didCompress,
        compressMeta
      });
      return working;
    } finally {
      endProcessing();
    }
  }

  async function requestHostConvert(file, targetMime) {
    const id = ++hostConvertSeq;
    const bytes = await file.arrayBuffer();
    return new Promise((resolve, reject) => {
      pendingHostConvert.set(id, { resolve, reject });
      postToBridge("convert-request", {
        id,
        targetMime,
        name: file.name,
        type: file.type || Mime.mimeFromFile(file),
        lastModified: file.lastModified || Date.now(),
        bytes
      });
      setTimeout(() => {
        if (pendingHostConvert.has(id)) {
          pendingHostConvert.delete(id);
          reject(new Error("Conversion timed out"));
        }
      }, 120000);
    });
  }

  function isPreviewableImage(mime) {
    return (
      Boolean(mime) &&
      mime.startsWith("image/") &&
      mime !== "image/heic" &&
      mime !== "image/heif"
    );
  }

  async function requestPreview(original, converted, target, flags) {
    const id = ++previewSeq;
    const originalType = Mime.mimeFromFile(original);
    const convertedType = target || Mime.mimeFromFile(converted);
    const payload = {
      id,
      originalName: original.name,
      originalType,
      convertedName: converted.name,
      convertedType,
      originalSize: original.size,
      convertedSize: converted.size,
      didConvert: Boolean(flags && flags.didConvert),
      didCompress: Boolean(flags && flags.didCompress)
    };

    // Transfer image bytes for the wipe slider (skip huge non-images / HEIC).
    try {
      if (isPreviewableImage(originalType) && original.size < 12 * 1024 * 1024) {
        payload.originalBytes = await original.arrayBuffer();
      }
      if (isPreviewableImage(convertedType) && converted.size < 12 * 1024 * 1024) {
        payload.convertedBytes = await converted.arrayBuffer();
      }
    } catch (_) {
      /* meta-only preview still works */
    }

    return new Promise((resolve) => {
      pendingPreview.set(id, { resolve });
      // Timeout: keep original (safer than uploading unreviewed changes)
      setTimeout(() => {
        if (pendingPreview.has(id)) {
          pendingPreview.delete(id);
          resolve(false);
        }
      }, 60000);
      postToBridge("preview", payload);
    });
  }

  async function convertFileList(fileList, ctx) {
    const files = Array.from(fileList || []);
    const out = [];
    for (const f of files) {
      out.push(await maybeConvertFile(f, ctx));
    }
    return out;
  }

  function filesToFileList(files) {
    const dt = new DataTransfer();
    for (const f of files) dt.items.add(f);
    return dt.files;
  }

  // ─── Smart picker accept (must run BEFORE the native picker opens) ─────────
  // Expand accept to native + convertible sources so the OS dialog hides junk
  // (e.g. .exe on a PNG field) while still listing JPG / HEIC / WebP, etc.
  // Conversion must always use the site's original accept (savedAccept) — never
  // the expanded picker string, or JPG would "match" a PNG-only field and skip.

  const nativeSetAttribute = Element.prototype.setAttribute;

  function shouldSkipAcceptExpansion(input) {
    if (!(input instanceof HTMLInputElement) || input.type !== "file") return true;
    if (settings.autoConvert === false) return true;
    if (input.webkitdirectory || input.hasAttribute("webkitdirectory")) return true;
    if (input.hasAttribute("capture")) return true;
    return false;
  }

  function expandedAcceptForInput(original) {
    return Mime.buildExpandedAccept(
      original,
      settings.preferredImageFormat,
      (file, target) => Registry.canHandle(file, target)
    );
  }

  function prepareAcceptForPicker(input) {
    if (shouldSkipAcceptExpansion(input)) return;
    const currentAttr = input.getAttribute("accept");
    const currentProp = input.accept;
    const current = currentAttr != null ? currentAttr : currentProp || "";
    if (!current) return;

    // Capture site intent once. pointerdown + click both prepare the picker;
    // never overwrite savedAccept with an already-expanded value.
    if (!savedAccept.has(input)) {
      if (acceptExpandedForPicker.has(input)) return;
      savedAccept.set(input, current);
    }

    const original = savedAccept.get(input);
    if (!original) return;
    const expanded = expandedAcceptForInput(original);
    if (!expanded) return;

    try {
      // Bypass patched setAttribute. IDL `input.accept = …` also reflects through
      // setAttribute; using only the native attr write avoids poisoning savedAccept
      // when prepare runs again while the picker is still open.
      if (input.getAttribute("accept") !== expanded) {
        nativeSetAttribute.call(input, "accept", expanded);
      }
    } catch (_) {
      /* ignore */
    }
    acceptExpandedForPicker.add(input);
  }

  function restoreAcceptAfterPicker(input) {
    if (!(input instanceof HTMLInputElement)) return;
    if (!savedAccept.has(input)) return;
    if (!acceptExpandedForPicker.has(input)) return;
    const original = savedAccept.get(input);
    try {
      if (original) {
        nativeSetAttribute.call(input, "accept", original);
      } else {
        input.removeAttribute("accept");
      }
    } catch (_) {
      /* ignore */
    }
    acceptExpandedForPicker.delete(input);
  }

  function resolveFileInputFromEvent(event) {
    const path =
      typeof event.composedPath === "function" ? event.composedPath() : [event.target];
    for (const node of path) {
      if (node instanceof HTMLInputElement && node.type === "file") {
        return node;
      }
      if (node instanceof HTMLLabelElement) {
        const control = node.control;
        if (control instanceof HTMLInputElement && control.type === "file") {
          return control;
        }
        if (node.htmlFor) {
          const byId = document.getElementById(node.htmlFor);
          if (byId instanceof HTMLInputElement && byId.type === "file") return byId;
        }
      }
    }
    // Label wrapping / for= outside composedPath edge cases
    const t = event.target;
    if (t && t.closest) {
      const label = t.closest("label");
      if (label) {
        const control = label.control;
        if (control instanceof HTMLInputElement && control.type === "file") return control;
      }
    }
    return null;
  }

  function onPickerGesture(event) {
    const input = resolveFileInputFromEvent(event);
    if (input) prepareAcceptForPicker(input);
  }

  // Capture: save + clear early. Bubble on window: clear again after page handlers
  // that may have restored accept, and before the browser's default file dialog.
  document.addEventListener("click", onPickerGesture, true);
  document.addEventListener("pointerdown", onPickerGesture, true);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    onPickerGesture(event);
  }, true);
  window.addEventListener("click", onPickerGesture, false);
  window.addEventListener("pointerdown", onPickerGesture, false);

  // Restore accept when the picker closes (change, cancel, or focus return).
  function onPickerClosed(event) {
    const t = event.target;
    if (t instanceof HTMLInputElement && t.type === "file") {
      restoreAcceptAfterPicker(t);
    }
  }
  document.addEventListener("change", onPickerClosed, true);
  document.addEventListener("cancel", onPickerClosed, true);
  window.addEventListener("focus", () => {
    // After native dialog dismisses, restore any picker-expanded inputs.
    document.querySelectorAll('input[type="file"]').forEach((el) => {
      if (acceptExpandedForPicker.has(el)) restoreAcceptAfterPicker(el);
    });
  });

  // Patch click / showPicker so programmatic openers also expand accept.
  const nativeInputClick = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function patchedClick() {
    if (this.type === "file") prepareAcceptForPicker(this);
    return nativeInputClick.apply(this, arguments);
  };

  if (typeof HTMLInputElement.prototype.showPicker === "function") {
    const nativeShowPicker = HTMLInputElement.prototype.showPicker;
    HTMLInputElement.prototype.showPicker = function patchedShowPicker() {
      if (this.type === "file") prepareAcceptForPicker(this);
      return nativeShowPicker.apply(this, arguments);
    };
  }

  // If a framework sets accept= while the picker is open, remember site intent
  // but keep the expanded accept on the element until the picker finishes.
  Element.prototype.setAttribute = function patchedSetAttribute(name, value) {
    if (
      this instanceof HTMLInputElement &&
      this.type === "file" &&
      String(name).toLowerCase() === "accept" &&
      acceptExpandedForPicker.has(this)
    ) {
      const next = value == null ? "" : String(value);
      const prior = savedAccept.has(this) ? savedAccept.get(this) : "";
      // Ignore re-application of our expanded string (prepare runs on
      // pointerdown and click; IDL reflection can also re-enter here).
      const expandedFromPrior = prior ? expandedAcceptForInput(prior) : "";
      if (next && next !== expandedFromPrior) {
        savedAccept.set(this, next);
      }
      return undefined;
    }
    return nativeSetAttribute.apply(this, arguments);
  };

  // ─── Patch HTMLInputElement.files ─────────────────────────────────────────
  const inputProto = HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(inputProto, "files");
  const nativeFilesGetter = desc && desc.get;
  const nativeFilesSetter = desc && desc.set;

  // Track programmatic sets that we ourselves perform
  const silentAssign = new WeakSet();

  function assignFiles(input, files) {
    const list = filesToFileList(files);
    silentAssign.add(input);
    try {
      if (nativeFilesSetter) {
        nativeFilesSetter.call(input, list);
      } else {
        Object.defineProperty(input, "files", {
          configurable: true,
          get: () => list
        });
      }
    } finally {
      setTimeout(() => silentAssign.delete(input), 0);
    }
    return list;
  }

  async function processInputFiles(input, fileList) {
    if (!autoPipelineActive() || !input || input.type !== "file") return false;
    if (silentAssign.has(input)) return false;
    const files = Array.from(
      fileList || (nativeFilesGetter ? nativeFilesGetter.call(input) : input.files) || []
    );
    if (!files.length) return false;

    const accept = effectiveAccept(input);
    const converted = await convertFileList(files, { input, accept });
    const changed = converted.some((f, i) => f !== files[i]);
    if (!changed) return false;
    assignFiles(input, converted);
    return true;
  }

  function filesNeedConversion(files, accept) {
    if (settings.autoConvert === false) return false;
    return Array.from(files || []).some((f) => {
      const t = Mime.inferTargetMime(f, accept, settings.preferredImageFormat);
      return t && Registry.canHandle(f, t);
    });
  }

  function filesNeedCompress(files, ctx) {
    if (!settings.autoCompress || !Compress || !SizeLimit) return false;
    const limit = SizeLimit.resolveMaxBytes(ctx, settings);
    if (!limit || !(limit.bytes > 0)) return false;
    return Array.from(files || []).some(
      (f) => Compress.canCompress(f) && f.size > limit.bytes
    );
  }

  function filesNeedWork(files, ctx) {
    // Prefer saved/site accept over any ctx.accept that may still be expanded.
    const accept = acceptFromContext(ctx) || (ctx && ctx.accept) || "";
    return filesNeedConversion(files, accept) || filesNeedCompress(files, ctx);
  }

  // Capture-phase: stop the original change when we will convert, then re-dispatch
  // after files are replaced so frameworks only see the converted FileList.
  function onFileEvent(event) {
    if (event.__swiftconvert) return;
    const t = event.target;
    if (!(t instanceof HTMLInputElement) || t.type !== "file") return;
    if (silentAssign.has(t)) return;
    if (!autoPipelineActive()) return;

    const snapshot = nativeFilesGetter ? nativeFilesGetter.call(t) : t.files;
    const accept = effectiveAccept(t);
    const ctx = { input: t, accept };
    if (!filesNeedWork(snapshot, ctx)) return;

    event.stopImmediatePropagation();
    event.stopPropagation();

    // Ensure accept is restored for any page logic that reads it during change.
    restoreAcceptAfterPicker(t);

    processInputFiles(t, snapshot).then((changed) => {
      const ev = new Event(event.type, { bubbles: true, cancelable: true });
      Object.defineProperty(ev, "__swiftconvert", { value: true });
      if (changed) silentAssign.add(t);
      t.dispatchEvent(ev);
      setTimeout(() => silentAssign.delete(t), 0);
    });
  }

  document.addEventListener("change", onFileEvent, true);
  document.addEventListener("input", onFileEvent, true);

  // ─── Drag and drop ────────────────────────────────────────────────────────
  // Expand accept during drag-over on file inputs (same as picker) so drops are allowed.
  // Dropping a JPG onto <input accept=".png">
  // is rejected by the browser before change fires, so conversion never runs.
  // Custom dropzones need a synthetic drop whose dataTransfer reliably carries Files.

  function findFileInputNear(node) {
    if (!(node && node.nodeType === 1)) return null;
    if (node instanceof HTMLInputElement && node.type === "file") return node;
    const scope =
      (node.closest &&
        node.closest("label, form, [data-accept], [role='button'], .dropzone, .drop-zone, .upload")) ||
      node;
    if (scope && scope.querySelector) {
      const found = scope.querySelector('input[type="file"]');
      if (found) return found;
    }
    if (node.parentElement && node.parentElement.querySelector) {
      const sibling = node.parentElement.querySelector('input[type="file"]');
      if (sibling) return sibling;
    }
    return null;
  }

  function resolveDropContext(event) {
    let accept = "";
    let input = null;
    let dropHost = null;
    const path =
      typeof event.composedPath === "function" ? event.composedPath() : [event.target];

    for (const node of path) {
      if (node instanceof HTMLInputElement && node.type === "file") {
        input = node;
        accept = effectiveAccept(node) || "";
        break;
      }
      if (node && node.getAttribute) {
        const a = node.getAttribute("data-accept") || node.getAttribute("accept");
        if (a) {
          accept = a;
          dropHost = node.nodeType === 1 ? node : null;
          break;
        }
      }
    }

    if (!input) {
      for (const node of path) {
        const near = findFileInputNear(node);
        if (near) {
          input = near;
          if (!accept) accept = effectiveAccept(near) || "";
          break;
        }
      }
    }

    if (!accept && input) accept = effectiveAccept(input) || "";

    const target =
      dropHost ||
      (event.target && event.target.nodeType === 1
        ? event.target
        : event.target && event.target.parentElement) ||
      input;

    // True when the gesture landed on the file input (or its label), not a
    // surrounding custom dropzone that merely contains/associates an input.
    const preferInput = dropTargetsFileInput(event, input, dropHost);

    return { accept, input, target, dropHost, preferInput };
  }

  function dropTargetsFileInput(event, input, dropHost) {
    if (!input) return false;
    // Custom accept host that wraps/owns the input → treat as zone, not input.
    if (dropHost && dropHost !== input && dropHost.contains && dropHost.contains(input)) {
      return false;
    }
    const path =
      typeof event.composedPath === "function" ? event.composedPath() : [event.target];
    for (const node of path) {
      if (node === input) return true;
      if (node instanceof HTMLLabelElement) {
        const control = node.control;
        if (control === input) return true;
        if (node.htmlFor && document.getElementById(node.htmlFor) === input) return true;
      }
    }
    return false;
  }

  function buildDataTransfer(files) {
    const dt = new DataTransfer();
    for (const f of files) dt.items.add(f);
    return dt;
  }

  function dispatchSyntheticDrop(target, files, sourceEvent) {
    if (!target || typeof target.dispatchEvent !== "function") return;
    const dt = buildDataTransfer(files);

    const tryDispatch = (evt) => {
      Object.defineProperty(evt, "__swiftconvert", { value: true });
      try {
        Object.defineProperty(evt, "dataTransfer", {
          configurable: true,
          enumerable: true,
          get: () => dt
        });
      } catch (_) {
        /* engine may already expose dataTransfer */
      }
      target.dispatchEvent(evt);
    };

    // Prefer DragEvent with init dataTransfer; fall back to Event + getter override.
    try {
      const drag = new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        composed: true,
        dataTransfer: dt,
        clientX: sourceEvent.clientX,
        clientY: sourceEvent.clientY,
        screenX: sourceEvent.screenX,
        screenY: sourceEvent.screenY
      });
      tryDispatch(drag);
      if (drag.dataTransfer && drag.dataTransfer.files && drag.dataTransfer.files.length) {
        return;
      }
    } catch (_) {
      /* continue to Event fallback */
    }

    const plain = new Event("drop", { bubbles: true, cancelable: true, composed: true });
    tryDispatch(plain);
  }

  function fireInputChange(input) {
    if (!input) return;
    const change = new Event("change", { bubbles: true, cancelable: true });
    Object.defineProperty(change, "__swiftconvert", { value: true });
    silentAssign.add(input);
    input.dispatchEvent(change);
    setTimeout(() => silentAssign.delete(input), 0);
  }

  /**
   * Deliver converted files once. Previously we always assigned the input AND
   * dispatched a synthetic drop — sites that listen to both (or a dropzone +
   * hidden input) uploaded the converted file twice (or original + converted).
   *
   * - Drop on a file input / its label → assign FileList + change only
   * - Drop on a custom zone → synthetic drop only; silently sync nearby input
   *   for form posts without firing change
   */
  function deliverConvertedDrop(sourceEvent, files, ctx) {
    const { input, target, preferInput } = ctx;

    if (input && preferInput) {
      assignFiles(input, files);
      fireInputChange(input);
      return;
    }

    if (input) {
      // Keep input.files in sync for form submits, but do not fire change —
      // the synthetic drop is the single delivery path for zone handlers.
      assignFiles(input, files);
    }
    const dropTarget = target || input || sourceEvent.target;
    dispatchSyntheticDrop(dropTarget, files, sourceEvent);
  }

  document.addEventListener(
    "drop",
    (event) => {
      if (event.__swiftconvert) return;
      if (!autoPipelineActive()) return;
      const dt = event.dataTransfer;
      if (!dt || !dt.files || !dt.files.length) return;

      const ctx = resolveDropContext(event);
      const originals = Array.from(dt.files);
      if (!filesNeedWork(originals, ctx)) {
        if (ctx.input) restoreAcceptAfterPicker(ctx.input);
        return;
      }

      // Intercept before the browser rejects mismatched types on accept= file inputs,
      // and before page drop handlers read the original FileList.
      event.preventDefault();
      event.stopImmediatePropagation();

      convertFileList(originals, { accept: ctx.accept, input: ctx.input })
        .then((converted) => {
          if (ctx.input) restoreAcceptAfterPicker(ctx.input);
          deliverConvertedDrop(event, converted, ctx);
        })
        .catch(() => {
          if (ctx.input) restoreAcceptAfterPicker(ctx.input);
          deliverConvertedDrop(event, originals, ctx);
        });
    },
    true
  );

  // Expand accept during drag-over on file inputs; conversion uses savedAccept via effectiveAccept.
  function onDragOverFileInput(event) {
    if (settings.autoConvert === false) return;
    const input = resolveDropContext(event).input;
    if (input) prepareAcceptForPicker(input);
  }
  document.addEventListener("dragenter", onDragOverFileInput, true);
  document.addEventListener("dragover", onDragOverFileInput, true);

  function restoreNeutralizedAccepts() {
    document.querySelectorAll('input[type="file"]').forEach((el) => {
      if (acceptExpandedForPicker.has(el)) restoreAcceptAfterPicker(el);
    });
  }

  document.addEventListener(
    "dragleave",
    (event) => {
      // relatedTarget null ≈ leaving the document / window
      if (event.relatedTarget) return;
      restoreNeutralizedAccepts();
    },
    true
  );
  document.addEventListener("dragend", restoreNeutralizedAccepts, true);

  // ─── FormData.append / set ────────────────────────────────────────────────
  const fdAppend = FormData.prototype.append;
  const fdSet = FormData.prototype.set;

  function patchFormDataMethod(original) {
    return function (name, value, filename) {
      if (!autoPipelineActive() || !(value instanceof File) || value instanceof Blob === false) {
        return original.apply(this, arguments);
      }
      // FormData often lacks accept context — try last focused file input
      const active = document.activeElement;
      const accept =
        active instanceof HTMLInputElement && active.type === "file"
          ? effectiveAccept(active)
          : "";
      const target = Mime.inferTargetMime(value, accept, settings.preferredImageFormat);
      if (!target || !Registry.canHandle(value, target)) {
        return original.apply(this, arguments);
      }

      const pending = maybeConvertFile(value, { accept });
      trackPending(pending);
      // If already resolved synchronously (rare), use it — else append original and
      // rely on input-level conversion for the common case.
      return original.call(this, name, value, filename);
    };
  }

  FormData.prototype.append = patchFormDataMethod(fdAppend);
  FormData.prototype.set = patchFormDataMethod(fdSet);

  const pendingConversions = new Set();
  function trackPending(p) {
    pendingConversions.add(p);
    Promise.resolve(p).finally(() => pendingConversions.delete(p));
  }
  async function awaitPending() {
    while (pendingConversions.size) {
      await Promise.all([...pendingConversions]);
    }
  }

  // ─── fetch / XHR — wait for in-flight converts, rewrite FormData Files ────
  const nativeFetch = window.fetch;
  window.fetch = async function (input, init) {
    if (autoPipelineActive()) {
      await awaitPending();
      if (init && init.body instanceof FormData) {
        init = { ...init, body: await rewriteFormData(init.body) };
      }
    }
    return nativeFetch.call(this, input, init);
  };

  const xhrOpen = XMLHttpRequest.prototype.open;
  const xhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function () {
    this.__scUrl = arguments[1];
    return xhrOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    if (!autoPipelineActive() || !(body instanceof FormData)) {
      return xhrSend.apply(this, arguments);
    }
    const xhr = this;
    awaitPending()
      .then(() => rewriteFormData(body))
      .then((fd) => xhrSend.call(xhr, fd))
      .catch(() => xhrSend.call(xhr, body));
  };

  async function rewriteFormData(fd) {
    const next = new FormData();
    // Best-effort: use focused/covered file input for accept + size limit context
    const active = document.activeElement;
    let input =
      active instanceof HTMLInputElement && active.type === "file" ? active : null;
    if (!input) {
      input = document.querySelector(
        'input[type="file"][data-swiftconvert-covered="1"]'
      );
    }
    const ctx = {
      input,
      accept: input ? effectiveAccept(input) : ""
    };
    for (const [key, val] of fd.entries()) {
      if (val instanceof File) {
        const converted = await maybeConvertFile(val, ctx);
        next.append(key, converted, converted.name);
      } else {
        next.append(key, val);
      }
    }
    return next;
  }

  // ─── DataTransferItemList / programmatic assignment ───────────────────────
  // Hook value setter used by some libs: Object.defineProperty on inputs
  if (nativeFilesSetter) {
    Object.defineProperty(inputProto, "files", {
      configurable: true,
      enumerable: true,
      get: function () {
        return nativeFilesGetter.call(this);
      },
      set: function (fileList) {
        nativeFilesSetter.call(this, fileList);
        if (!silentAssign.has(this)) {
          processInputFiles(this, fileList).then(() => {
            // After async convert, fire change so React/Vue see new files
            const ev = new Event("change", { bubbles: true });
            Object.defineProperty(ev, "__swiftconvert", { value: true });
            silentAssign.add(this);
            this.dispatchEvent(ev);
            setTimeout(() => silentAssign.delete(this), 0);
          });
        }
      }
    });
  }

  // Keep coverage marks current for SPA-inserted upload fields.
  const coverageObserver = new MutationObserver(() => {
    if (coverageObserver.__scScheduled) return;
    coverageObserver.__scScheduled = true;
    requestAnimationFrame(() => {
      coverageObserver.__scScheduled = false;
      refreshCoverageMarks();
    });
  });
  try {
    coverageObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["accept", "data-accept", "type"]
    });
  } catch (_) {
    /* ignore */
  }
  refreshCoverageMarks();

  postToBridge("hooked", { version: "0.3.5" });
})();
