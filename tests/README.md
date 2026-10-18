# Manual result drag tests

Run the protocol checks with Node.js 20 or newer:

```sh
node tests/manual-drag.test.cjs
```

These load the real Tools and background scripts, checking byte integrity over
multiple chunks, empty files, invalid requests, and stale result identifiers.

The browser checks additionally require Playwright and Google Chrome:

```sh
npm install --no-save --package-lock=false playwright
node tests/manual-drag.browser.cjs
```

`CHROME_PATH` can select another Chrome executable. `PLAYWRIGHT_MODULE` can point
to an existing Playwright package instead of installing it locally.

The browser runner uses a temporary profile and a local server. It exercises the
real page hook and content bridge using trusted mouse drags with no native File
item, including the text-only fallback, disabled automatic conversion, custom
drop areas, duplicate event prevention, and unavailable-result errors. It mocks
Chrome extension messaging through the real Tools/background handlers. It does
not load the packaged extension or test native drags between separate windows.

## Final check with the unpacked extension

1. Disable other SwiftConvert copies, load this folder as an unpacked extension,
   and refresh the destination tab so its content scripts match this version.
2. In this folder, run `python -m http.server 8766 --bind 127.0.0.1` and visit
   `http://127.0.0.1:8766/demo/csp-upload.html`. Confirm **Hooked: yes**.
3. Open **Tools panel**, choose `demo/sample.jpg`, convert to PNG, and accept.
   Keep this separate Tools window open.
4. Drag **Drag out** directly onto **Choose File**. The field should select the
   PNG and the output should report its name, `image/png`, and its size.
5. Convert again and drag the handle onto the page's result area. The diagnostic
   output should report one file with the converted name and MIME type.
6. Verify Download still saves the converted file. Try picking a JPG directly
   through the demo's file chooser to confirm automatic conversion still works.
7. Repeat manual drag with automatic conversion/compression disabled. Then close
   Tools or change its result while a drag is underway: the destination should
   show an unavailable-result error without replacing the current upload.

Manual delivery uses the existing input assignment/synthetic drop mechanism.
Sites that explicitly reject synthetic events may reject this delivery, and
browser pages where extension content scripts cannot run are unsupported. Drag
to the desktop/file manager is outside this webpage-upload handoff.
