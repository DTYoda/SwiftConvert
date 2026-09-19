# SwiftConvert

Browser extension that intercepts file uploads and converts mismatched files to the format a site expects — for example JPG → PNG when the field only accepts PNG.

Invisible by default when enabled. Optional preview-before-upload for quality checks (especially useful once DOCX/PDF converters land). Quiet conversion toast is **on by default**.

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

Also try drag-and-drop (onto the drop zone **and** the native file input), the **drop zone + hidden input** fixture (should report `deliveries: 1`), FormData/fetch, **label-triggered**, and **dynamically created** inputs on the same page. Covered fields show a small **SC** badge when the extension is enabled.

### After updating the extension

Open `chrome://extensions` → find SwiftConvert → **Reload**, then hard-refresh the demo tab.

### Preview mode

Open the extension popup → enable **Preview before upload** (or full Options). The next conversion shows a confirm dialog before the upload proceeds.

### Manual converter

Toolbar popup includes a **Manual converter**: pick or drop an image, choose PNG / JPEG / WebP, then **Download** or **Drag out**.

Chrome closes the toolbar popup when focus leaves it, which cancels drag-out. Use **Open converter panel** (detached window) for reliable drag onto a webpage. The panel sets both a `File` dataTransfer item and `DownloadURL` where the engine allows it; some host pages still only accept drops from OS files.

## What works in this slice

| Path | Status |
|------|--------|
| `<input type="file">` (picker + change) | Supported — `accept` neutralized before dialog |
| Label / `input.click()` / `showPicker()` | Supported |
| Dynamically created inputs | Supported (prototype + capture hooks) |
| Drag & drop (file input + `accept` / `data-accept` zones) | Supported — single delivery (input **or** synthetic drop, not both) |
| Covered-field badge | Small **SC** marker on autoconvert fields when enabled |
| `FormData` + `fetch` / XHR | Best-effort (files already converted on inputs pass through; fetch/XHR can await in-flight converts) |
| Images → PNG / JPEG / WebP | Supported (canvas) |
| Manual converter (popup / panel) | Download + best-effort drag-out |
| DOCX / PDF | Stubbed in the converter registry — not implemented yet |

Page hooks run in the **MAIN** world at `document_start` (CSP-safe). A DOM script-tag inject remains only as a fallback.

## Project layout

```
manifest.json
src/
  background/service-worker.js
  content/bridge.js          # settings bridge + preview / toast / badges
  content/page-hook.js       # page-world interception
  lib/mime.js                # accept / MIME inference
  lib/converters/            # image + stubs + registry
  options/                   # popup, options, manual converter panel
icons/
demo/                        # local test page + sample.jpg
```

## Options

- **Enable SwiftConvert** — master switch
- **Preview before upload** — confirm each conversion
- **Quiet conversion toast** — brief on-page notice when converting without preview (**default: on**)
- **Preferred image format** — when a field accepts multiple image types (`auto` prefers PNG)

### Settings storage note

Defaults live in code (`showQuietBadge: true` as of v0.1.3). Values already saved in `chrome.storage.sync` override defaults. Upgrading from an older build that stored `showQuietBadge: false` migrates quiet toast **on** once (schema v2); you can turn it off again in the popup. Clearing extension storage restores all defaults.

## Limitations

- GIF conversion uses the frame decoded by the browser (typically the first frame).
- SVG and exotic codecs are not converted in this slice.
- Sites that validate file bytes **before** our hooks run, or that read files via private APIs we do not patch, may still see the original.
- Dropzones with **no** accept hint cannot infer a target type; prefer `accept` on inputs or `data-accept` on the zone (as in the demo).
- Dragging a converted file from the **toolbar popup** onto a page is unreliable in Chrome (popup closes on blur). Use the detached converter panel.
- Complex document conversion (DOCX/PDF) is intentionally stubbed for a later iteration.
