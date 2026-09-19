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

  const CHANNEL = "swiftconvert";
  let settings = {
    enabled: true,
    previewBeforeUpload: false,
    preferredImageFormat: "auto",
    showQuietBadge: false
  };

  const pendingPreview = new Map();
  let previewSeq = 0;

  function postToBridge(type, payload) {
    window.postMessage({ source: CHANNEL, direction: "page-to-bridge", type, payload }, "*");
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== CHANNEL || data.direction !== "bridge-to-page") return;

    if (data.type === "settings") {
      settings = { ...settings, ...data.payload };
    }
    if (data.type === "preview-result") {
      const { id, accepted } = data.payload || {};
      const entry = pendingPreview.get(id);
      if (entry) {
        pendingPreview.delete(id);
        entry.resolve(Boolean(accepted));
      }
    }
  });

  // Ask bridge for current settings
  postToBridge("ready", {});

  function acceptFromContext(ctx) {
    if (!ctx) return "";
    if (typeof ctx === "string") return ctx;
    if (ctx.accept) return ctx.accept;
    if (ctx.input && ctx.input.accept) return ctx.input.accept;
    return "";
  }

  async function maybeConvertFile(file, ctx) {
    if (!settings.enabled || !file) return file;
    const accept = acceptFromContext(ctx);
    const target = Mime.inferTargetMime(file, accept, settings.preferredImageFormat);
    if (!target) return file;
    if (!Registry.canHandle(file, target)) {
      postToBridge("skip", {
        reason: "no-converter",
        name: file.name,
        from: Mime.mimeFromFile(file),
        to: target
      });
      return file;
    }

    let converted;
    try {
      converted = await Registry.convertFile(file, target);
    } catch (err) {
      postToBridge("error", { message: String(err && err.message ? err.message : err) });
      return file;
    }

    if (settings.previewBeforeUpload) {
      const ok = await requestPreview(file, converted, target);
      if (!ok) return file; // user declined — keep original
    } else if (settings.showQuietBadge) {
      postToBridge("converted-quiet", {
        from: file.name,
        to: converted.name,
        target
      });
    }

    postToBridge("converted", {
      from: file.name,
      to: converted.name,
      fromMime: Mime.mimeFromFile(file),
      toMime: target
    });
    return converted;
  }

  function requestPreview(original, converted, target) {
    const id = ++previewSeq;
    return new Promise((resolve) => {
      pendingPreview.set(id, { resolve });
      // Timeout: auto-accept after 60s so uploads aren't stuck forever
      setTimeout(() => {
        if (pendingPreview.has(id)) {
          pendingPreview.delete(id);
          resolve(true);
        }
      }, 60000);
      postToBridge("preview", {
        id,
        originalName: original.name,
        originalType: Mime.mimeFromFile(original),
        convertedName: converted.name,
        convertedType: target,
        originalSize: original.size,
        convertedSize: converted.size
      });
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
    if (!settings.enabled || !input || input.type !== "file") return false;
    if (silentAssign.has(input)) return false;
    const files = Array.from(
      fileList || (nativeFilesGetter ? nativeFilesGetter.call(input) : input.files) || []
    );
    if (!files.length) return false;

    const converted = await convertFileList(files, { input, accept: input.accept });
    const changed = converted.some((f, i) => f !== files[i]);
    if (!changed) return false;
    assignFiles(input, converted);
    return true;
  }

  function filesNeedConversion(files, accept) {
    return Array.from(files || []).some((f) => {
      const t = Mime.inferTargetMime(f, accept, settings.preferredImageFormat);
      return t && Registry.canHandle(f, t);
    });
  }

  // Capture-phase: stop the original change when we will convert, then re-dispatch
  // after files are replaced so frameworks only see the converted FileList.
  function onFileEvent(event) {
    if (event.__swiftconvert) return;
    const t = event.target;
    if (!(t instanceof HTMLInputElement) || t.type !== "file") return;
    if (silentAssign.has(t)) return;
    if (!settings.enabled) return;

    const snapshot = nativeFilesGetter ? nativeFilesGetter.call(t) : t.files;
    if (!filesNeedConversion(snapshot, t.accept)) return;

    event.stopImmediatePropagation();
    event.stopPropagation();

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
  document.addEventListener(
    "drop",
    (event) => {
      if (event.__swiftconvert) return;
      if (!settings.enabled) return;
      const dt = event.dataTransfer;
      if (!dt || !dt.files || !dt.files.length) return;

      // Find nearest file input or dropzone with accept hints
      let accept = "";
      const path = typeof event.composedPath === "function" ? event.composedPath() : [];
      for (const node of path) {
        if (node instanceof HTMLInputElement && node.type === "file") {
          accept = node.accept || "";
          break;
        }
        if (node && node.getAttribute) {
          const a = node.getAttribute("data-accept") || node.getAttribute("accept");
          if (a) {
            accept = a;
            break;
          }
        }
      }

      // If dropping onto a file input, let change handler deal with it after browser assigns files.
      // For custom dropzones we intercept and rewrite DataTransfer asynchronously — which means
      // we must preventDefault and re-dispatch a synthetic drop with converted files.
      const targetIsFileInput =
        event.target instanceof HTMLInputElement && event.target.type === "file";
      if (targetIsFileInput) return;

      const originals = Array.from(dt.files);
      // Only intercept when we can infer a target
      const needsWork = originals.some((f) => Mime.inferTargetMime(f, accept, settings.preferredImageFormat));
      if (!needsWork && accept) {
        // still might need convert — infer returned null for match; skip
      }
      const maybeNeeded = originals.some((f) => {
        const t = Mime.inferTargetMime(f, accept, settings.preferredImageFormat);
        return t && Registry.canHandle(f, t);
      });
      if (!maybeNeeded) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      convertFileList(originals, { accept }).then((converted) => {
        const newDt = new DataTransfer();
        for (const f of converted) newDt.items.add(f);

        const synthetic = new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          composed: true,
          dataTransfer: newDt,
          clientX: event.clientX,
          clientY: event.clientY
        });
        Object.defineProperty(synthetic, "__swiftconvert", { value: true });
        event.target.dispatchEvent(synthetic);
      });
    },
    true
  );

  // Ignore our own synthetic drops in the handler above via flag check — already returned early
  // if no conversion needed. Add guard:
  const nativeAddEventListener = EventTarget.prototype.addEventListener;
  // (We use the capture listener's preventDefault path only when converting.)

  // ─── FormData.append / set ────────────────────────────────────────────────
  const fdAppend = FormData.prototype.append;
  const fdSet = FormData.prototype.set;

  function patchFormDataMethod(original) {
    return function (name, value, filename) {
      if (!settings.enabled || !(value instanceof File) || value instanceof Blob === false) {
        return original.apply(this, arguments);
      }
      // FormData often lacks accept context — try last focused file input
      const active = document.activeElement;
      const accept =
        active instanceof HTMLInputElement && active.type === "file" ? active.accept : "";
      const target = Mime.inferTargetMime(value, accept, settings.preferredImageFormat);
      if (!target || !Registry.canHandle(value, target)) {
        return original.apply(this, arguments);
      }

      // Synchronous FormData API cannot await — queue microtask rewrite is too late.
      // Convert eagerly via blocking isn't possible; instead store promise side-channel.
      // Practical approach: convert using a sync-infeasible path → use deasync-free
      // "replace on next tick" is unreliable. Better: pre-convert known Files when they
      // were already converted on the input. If still mismatched, kick off async convert
      // and append a placeholder then... too invasive.
      //
      // For this slice: if the File was already converted (name/type match target), pass through.
      // Otherwise attempt async conversion and expose via patched fetch/XHR that awaits pending.
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
    if (settings.enabled) {
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
    if (!settings.enabled || !(body instanceof FormData)) {
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
    for (const [key, val] of fd.entries()) {
      if (val instanceof File) {
        const converted = await maybeConvertFile(val, { accept: "" });
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
            silentAssign.add(this);
            this.dispatchEvent(ev);
            setTimeout(() => silentAssign.delete(this), 0);
          });
        }
      }
    });
  }

  // Observe dynamically added file inputs (no special logic needed — events bubble)
  postToBridge("hooked", { version: "0.1.0" });
})();
