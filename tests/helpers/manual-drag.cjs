const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");
const root = path.resolve(__dirname, "../..");

function element(properties = {}) {
  return Object.assign({
    handlers: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener(type, listener) { this.handlers[type] = listener; },
    setAttribute() {}, removeAttribute() {}
  }, properties);
}

function createSource(file) {
  const elements = {
    "[data-tool-file]": element({ files: [file] }),
    "[data-tool-do-convert]": element({ checked: true }),
    "[data-tool-run]": element(), "[data-tool-drag]": element(),
    "[data-tool-download]": element(), "[data-tool-status]": element()
  };
  const rootElement = { querySelector: (s) => elements[s] || null, querySelectorAll: () => [] };
  let listener;
  const scope = {
    console, URL, File, Uint8Array, btoa, crypto: webcrypto,
    document: { getElementById: () => rootElement, addEventListener() {} },
    window: { addEventListener() {} },
    chrome: { runtime: { id: "test-extension", getURL: (p) => "chrome-extension://test-extension/" + p,
      onMessage: { addListener(fn) { listener = fn; } } } },
    SwiftConvertMime: { mimeFromFile: (f) => f.type },
    SwiftConvertRegistry: { canHandle: () => true, convertFile: async () => file },
    SwiftConvertCompress: {}, SwiftConvertCompare: { fmtBytes: String }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, "src/options/tools.js"), "utf8"), scope);
  return {
    listener,
    async accept() {
      elements["[data-tool-file]"].handlers.change();
      await elements["[data-tool-run]"].handlers.click();
    },
    clear() { elements["[data-tool-do-convert]"].handlers.change(); },
    drag() {
      const values = {};
      const event = { dataTransfer: { items: { add() { return null; } },
        setData(type, value) { values[type] = value; } } };
      elements["[data-tool-drag]"].handlers.dragstart(event);
      return values;
    }
  };
}

function createRelay(source) {
  let listener;
  const runtime = {
    id: "test-extension", onInstalled: { addListener() {} },
    onMessage: { addListener(fn) { listener = fn; } },
    sendMessage(message, callback) {
      const active = source.listener(message, { id: runtime.id }, callback);
      if (!active) {
        runtime.lastError = { message: "No source." };
        callback();
        delete runtime.lastError;
      }
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, "src/background/service-worker.js"), "utf8"), {
    chrome: { runtime }, setTimeout
  });
  return (message, sender = { id: runtime.id, tab: { id: 1 }, url: "https://example.test/" }) =>
    new Promise((resolve) => listener(message, sender, resolve));
}

module.exports = { createSource, createRelay };
