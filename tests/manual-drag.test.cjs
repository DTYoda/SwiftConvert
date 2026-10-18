const assert = require("node:assert/strict");
const test = require("node:test");
const { createSource, createRelay } = require("./helpers/manual-drag.cjs");

test("a converted result is recovered byte-for-byte after the native File item is lost", async () => {
  const expected = Uint8Array.from({ length: 450108 }, (_, i) => i % 251);
  const source = createSource(new File([expected], "converted.png", { type: "image/png", lastModified: 12345 }));
  await source.accept();
  const drag = source.drag();
  const token = drag["application/x-swiftconvert-result"];
  assert.match(token, /^[0-9a-f-]{36}$/);
  assert.equal(drag["text/plain"], "swiftconvert-result:" + token);
  assert.equal(drag["text/uri-list"], undefined);
  const request = createRelay(source);
  const chunks = [];
  let offset = 0;
  while (offset < expected.length) {
    const response = await request({ type: "manual-drag-chunk", token, offset });
    assert.equal(response.ok, true);
    assert.equal(response.offset, offset);
    assert.equal(response.name, "converted.png");
    assert.equal(response.mime, "image/png");
    assert.equal(response.lastModified, 12345);
    const bytes = Buffer.from(response.data, "base64");
    assert.ok(bytes.length <= 192 * 1024);
    chunks.push(bytes);
    offset += bytes.length;
  }
  assert.deepEqual(Buffer.concat(chunks), Buffer.from(expected));
  source.clear();
  assert.equal((await request({ type: "manual-drag-chunk", token, offset: 0 })).ok, false);
});

test("relay rejects invalid identifiers, offsets, and senders", async () => {
  const source = createSource(new File(["content"], "result.txt"));
  await source.accept();
  const token = source.drag()["application/x-swiftconvert-result"];
  const request = createRelay(source);
  for (const message of [
    { token: "not-a-token", offset: 0 }, { token, offset: -1 }, { token, offset: 0.5 }
  ]) assert.equal((await request({ type: "manual-drag-chunk", ...message })).ok, false);
  for (const sender of [
    { id: "other-extension", tab: {}, url: "https://example.test/" },
    { id: "test-extension", url: "https://example.test/" },
    { id: "test-extension", tab: {}, url: "chrome://settings/" }
  ]) assert.equal((await request({ type: "manual-drag-chunk", token, offset: 0 }, sender)).ok, false);
  assert.equal(source.listener({ type: "manual-drag-source", token, offset: 0 },
    { id: "test-extension", tab: {} }, () => {}), false);
});

test("empty files transfer and replacing a result invalidates its old identifier", async () => {
  const source = createSource(new File([], "empty.txt", { type: "text/plain" }));
  await source.accept();
  const token = source.drag()["application/x-swiftconvert-result"];
  const request = createRelay(source);
  const response = await request({ type: "manual-drag-chunk", token, offset: 0 });
  assert.equal(response.ok, true);
  assert.equal(response.size, 0);
  assert.equal(response.data, "");
  await source.accept();
  assert.notEqual(source.drag()["application/x-swiftconvert-result"], token);
  assert.equal((await request({ type: "manual-drag-chunk", token, offset: 0 })).ok, false);
});
