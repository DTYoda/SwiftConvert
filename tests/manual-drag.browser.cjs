const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = path.resolve(__dirname, "..");
const { createSource, createRelay } = require(path.join(root, "tests/helpers/manual-drag.cjs"));

(async () => {
  const expected = Uint8Array.from({ length: 450108 }, (_, i) => i % 251);
  const source = createSource(new File([expected], "converted.png", { type: "image/png", lastModified: 12345 }));
  await source.accept();
  const token = source.drag()["application/x-swiftconvert-result"];
  const relay = createRelay(source);
  let requests = 0;
  const server = http.createServer((req, res) => {
    const file = path.resolve(root, "." + new URL(req.url, "http://local").pathname);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    try {
      res.setHeader("Content-Type", file.endsWith(".js") ? "application/javascript" :
        file.endsWith(".png") ? "image/png" : "text/html");
      res.end(fs.readFileSync(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + server.address().port;
  let browser;
  try {
    browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" }), headless: true });
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.exposeFunction("requestChunk", async message => { requests++; return relay(message); });
    await page.goto(origin + "/demo/csp-upload.html");
    await page.evaluate(({ origin, token }) => {
      window.testShadowRoots = [];
      const attachShadow = Element.prototype.attachShadow;
      Element.prototype.attachShadow = function (options) {
        const root = attachShadow.call(this, options);
        window.testShadowRoots.push(root);
        return root;
      };
      window.chrome = { runtime: { id: "test-extension", getURL: p => origin + "/" + p,
        sendMessage: (message, callback) => window.requestChunk(message).then(callback) },
        storage: { sync: { get(defaults, callback) { callback({ ...defaults,
          autoConvert: false, autoCompress: false, showFieldBadge: false, showQuietBadge: false }); } },
          onChanged: { addListener() {} } } };
      window.SwiftConvertRegistry = {};
      window.SwiftConvertCompress = {};
      const drag = document.createElement("div");
      drag.id = "drag-source"; drag.draggable = true; drag.textContent = "Converted result";
      drag.style.cssText = "position:fixed;left:10px;top:10px;width:150px;height:50px;background:lightgreen";
      drag.addEventListener("dragstart", event => {
        // Deliberately omit File items to reproduce the user's failed handoff.
        if (drag.dataset.mode !== "text") event.dataTransfer.setData("application/x-swiftconvert-result", token);
        event.dataTransfer.setData("text/plain", "swiftconvert-result:" + token);
      });
      document.body.append(drag);
      window.changeCount = 0; window.zoneDrops = []; window.zoneChanges = 0;
      document.querySelector("#f").addEventListener("change", () => window.changeCount++);
      const zone = document.createElement("div"); zone.id = "zone";
      zone.setAttribute("data-accept", "image/png");
      zone.style.cssText = "height:100px;border:2px dashed teal;margin-top:50px";
      zone.textContent = "Custom upload area";
      const hidden = document.createElement("input"); hidden.type = "file"; hidden.hidden = true;
      hidden.addEventListener("change", () => window.zoneChanges++); zone.append(hidden);
      zone.addEventListener("drop", event => { event.preventDefault(); window.zoneDrops.push(Array.from(event.dataTransfer.files)); });
      document.body.append(zone);
    }, { origin, token });
    for (const file of ["src/lib/mime.js", "src/content/page-hook.js", "src/content/bridge.js"])
      await page.addScriptTag({ url: origin + "/" + file });
    await page.waitForTimeout(600);

    await page.locator("#drag-source").dragTo(page.locator("#f"));
    await page.waitForFunction(() => window.changeCount === 1);
    const direct = await page.evaluate(async () => {
      const file = document.querySelector("#f").files[0];
      return { name: file.name, type: file.type, bytes: Array.from(new Uint8Array(await file.arrayBuffer())) };
    });
    assert.equal(direct.name, "converted.png"); assert.equal(direct.type, "image/png");
    assert.deepEqual(Buffer.from(direct.bytes), Buffer.from(expected));
    console.log("PASS: trusted drop with zero native files reaches the file input exactly once; bytes preserved.");

    await page.locator("#drag-source").dragTo(page.locator("#zone"));
    await page.waitForFunction(() => window.zoneDrops.length === 1);
    assert.deepEqual(await page.evaluate(() => ({ count: window.zoneDrops[0].length,
      size: window.zoneDrops[0][0].size, changes: window.zoneChanges,
      synced: document.querySelector("#zone input").files[0].size })),
      { count: 1, size: expected.length, changes: 0, synced: expected.length });
    console.log("PASS: custom upload area receives one file and no duplicate change event.");

    await page.locator("#drag-source").evaluate(el => el.dataset.mode = "text");
    await page.locator("#drag-source").dragTo(page.locator("#f"));
    await page.waitForFunction(() => window.changeCount === 2);
    console.log("PASS: text-only drag identifier fallback works with automatic conversion disabled.");

    const before = requests;
    await page.evaluate(token => {
      const dt = new DataTransfer(); dt.setData("application/x-swiftconvert-result", token);
      document.querySelector("#f").dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: dt }));
      window.postMessage({ source: "swiftconvert", direction: "page-to-bridge", type: "manual-drag", payload: { id: 1234, token } }, "*");
    }, token);
    await page.waitForTimeout(100);
    assert.equal(requests, before);
    console.log("PASS: scripted drop and forged page message cannot retrieve the result.");

    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(["ordinary"], "ordinary.png", { type: "image/png" }));
      document.querySelector("#zone").dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: dt }));
    });
    await page.waitForFunction(() => window.zoneDrops.length === 2);
    assert.equal(await page.evaluate(() => window.zoneDrops[1][0].name), "ordinary.png");
    assert.equal(requests, before);
    console.log("PASS: ordinary File drop event still reaches the existing drop handler.");

    source.clear();
    await page.locator("#drag-source").dragTo(page.locator("#f"));
    await page.waitForFunction(() => window.testShadowRoots.some(root => root.querySelector("#sc-toast.show")));
    assert.match(await page.evaluate(() => window.testShadowRoots.find(root => root.querySelector("#sc-toast")).querySelector("#sc-toast").textContent), /no longer available/);
    assert.equal(await page.evaluate(() => window.changeCount), 2);
    console.log("PASS: missing result shows an error without modifying the upload input.");
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
