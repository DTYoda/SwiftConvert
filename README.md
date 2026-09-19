# SwiftConvert

Browser extension that intercepts file uploads and converts mismatched files to the format a site expects — for example JPG → PNG when the field only accepts PNG.

Invisible by default when enabled. Optional preview-before-upload for quality checks (especially useful once DOCX/PDF converters land).

## Load unpacked (Chrome / Edge / Brave)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this repository root (the folder that contains `manifest.json`).
4. Pin SwiftConvert from the toolbar if you want quick access to the popup.

Firefox (MV3): open `about:debugging` → This Firefox → Load Temporary Add-on → pick `manifest.json`.

## Try the demo

1. Serve the repo (extensions often need `http://` rather than `file://` depending on browser settings):

   ```bash
   python3 -m http.server 8765
   ```

2. Open [http://127.0.0.1:8765/demo/](http://127.0.0.1:8765/demo/).
3. Ensure SwiftConvert is **enabled** (toolbar popup).
4. On **Native file input**, choose `demo/sample.jpg` (JPG must appear in the OS picker — SwiftConvert clears `accept` before the dialog opens, then converts).
5. The result panel should show `image/png` and a `.png` filename — the page only accepts PNG.

Converter-only smoke test (no extension): [http://127.0.0.1:8765/demo/self-test.html](http://127.0.0.1:8765/demo/self-test.html) should show `PASS`.

Also try drag-and-drop, FormData/fetch, **label-triggered**, and **dynamically created** inputs on the same page.

### After updating the extension

Open `chrome://extensions` → find SwiftConvert → **Reload**, then hard-refresh the demo tab.

### Preview mode

Open the extension popup → enable **Preview first** (or full Options). The next conversion shows a confirm dialog before the upload proceeds.

## What works in this slice

| Path | Status |
|------|--------|
| `<input type="file">` (picker + change) | Supported — `accept` neutralized before dialog |
| Label / `input.click()` / `showPicker()` | Supported |
| Dynamically created inputs | Supported (prototype + capture hooks) |
| Drag & drop (with `accept` / `data-accept`) | Supported |
| `FormData` + `fetch` / XHR | Best-effort (files already converted on inputs pass through; fetch/XHR can await in-flight converts) |
| Images → PNG / JPEG / WebP | Supported (canvas) |
| DOCX / PDF | Stubbed in the converter registry — not implemented yet |

Page hooks run in the **MAIN** world at `document_start` (CSP-safe). A DOM script-tag inject remains only as a fallback.

## Project layout

```
manifest.json
src/
  background/service-worker.js
  content/bridge.js          # injects page hook + preview UI
  content/page-hook.js       # page-world interception
  lib/mime.js                # accept / MIME inference
  lib/converters/            # image + stubs + registry
  options/                   # popup + options page
icons/
demo/                        # local test page + sample.jpg
```

## Options

- **Enable SwiftConvert** — master switch
- **Preview before upload** — confirm each conversion
- **Quiet conversion toast** — brief on-page notice when converting without preview
- **Preferred image format** — when a field accepts multiple image types (`auto` prefers PNG)

## Limitations

- GIF conversion uses the frame decoded by the browser (typically the first frame).
- SVG and exotic codecs are not converted in this slice.
- Sites that validate file bytes **before** our hooks run, or that read files via private APIs we do not patch, may still see the original.
- Dropzones with **no** accept hint cannot infer a target type; prefer `accept` on inputs or `data-accept` on the zone (as in the demo).
- Complex document conversion (DOCX/PDF) is intentionally stubbed for a later iteration.
