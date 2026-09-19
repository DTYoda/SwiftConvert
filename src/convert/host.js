/**
 * Hidden convert host — loads pdf.js (ESM) and answers convert RPCs from the bridge.
 * Runs as an extension page (iframe), so WASM / workers are CSP-safe.
 */
import * as pdfjs from "../lib/vendor/pdf.min.mjs";

const CHANNEL = "swiftconvert-host";

pdfjs.GlobalWorkerOptions.workerSrc =
  typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL
    ? chrome.runtime.getURL("src/lib/vendor/pdf.worker.min.mjs")
    : new URL("../lib/vendor/pdf.worker.min.mjs", import.meta.url).href;

globalThis.pdfjsLib = pdfjs;

function fileFromPayload(payload) {
  const bytes = payload.bytes instanceof ArrayBuffer
    ? new Uint8Array(payload.bytes)
    : new Uint8Array(payload.bytes || []);
  return new File([bytes], payload.name || "file", {
    type: payload.type || "",
    lastModified: payload.lastModified || Date.now()
  });
}

async function handleConvert(payload) {
  const Registry = globalThis.SwiftConvertRegistry;
  if (!Registry) throw new Error("Converter registry missing in host");
  const file = fileFromPayload(payload);
  const out = await Registry.convertFile(file, payload.targetMime);
  const buf = await out.arrayBuffer();
  return {
    name: out.name,
    type: out.type,
    lastModified: out.lastModified,
    bytes: buf
  };
}

window.addEventListener("message", async (event) => {
  const data = event.data;
  if (!data || data.source !== CHANNEL || data.type !== "convert") return;
  const id = data.id;
  try {
    const result = await handleConvert(data.payload || {});
    event.source.postMessage(
      { source: CHANNEL, type: "convert-result", id, ok: true, result },
      event.origin === "null" ? "*" : event.origin,
      [result.bytes]
    );
  } catch (err) {
    event.source.postMessage(
      {
        source: CHANNEL,
        type: "convert-result",
        id,
        ok: false,
        error: String(err && err.message ? err.message : err)
      },
      event.origin === "null" ? "*" : event.origin
    );
  }
});

window.parent.postMessage({ source: CHANNEL, type: "ready" }, "*");
