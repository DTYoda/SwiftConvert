/**
 * Boot pdf.js for extension UI pages, then load the classic converter UI.
 */
import * as pdfjs from "../lib/vendor/pdf.min.mjs";

pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL(
  "src/lib/vendor/pdf.worker.min.mjs"
);
globalThis.pdfjsLib = pdfjs;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load " + src));
    document.body.appendChild(s);
  });
}

await loadScript("./converter.js");
await loadScript("./compressor.js");
