# SwiftConvert

Browser extension that intercepts file uploads and converts mismatched files to the format a site expects — for example JPG → PNG, HEIC → JPEG, PDF → PNG, or DOCX → text.

<img src="icons/icon128.png" alt="SwiftConvert logo" width="64" height="64" />

Invisible by default when enabled. Optional preview-before-upload for quality checks on complex converts. Quiet conversion toast is **on by default**.

## Load unpacked (Chrome / Edge / Brave)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this repository root (the folder that contains `manifest.json`).
4. Pin SwiftConvert from the toolbar if you want quick access to the popup.

**After updating:** open `chrome://extensions` → find SwiftConvert → **Reload**, then hard-refresh any demo tabs.

Firefox (MV3): open `about:debugging` → This Firefox → Load Temporary Add-on → pick `manifest.json`.

## Try the demo

1. Serve the repo:

   ```bash
   python3 -m http.server 8765 --bind 127.0.0.1
   ```

2. Open [http://127.0.0.1:8765/demo/](http://127.0.0.1:8765/demo/).
3. Ensure SwiftConvert is **enabled** (toolbar popup).
4. On **Native file input**, choose `demo/sample.jpg` — result should be PNG.
5. Also try `sample.heic` on HEIC→JPEG, `sample.pdf` on PDF→PNG, and `sample.docx` on DOCX→text.

Converter self-test (no extension required for the convert host libs): [http://127.0.0.1:8765/demo/self-test.html](http://127.0.0.1:8765/demo/self-test.html) should show `ALL PASS`.

### Manual converter

Toolbar popup includes a **Manual converter**: pick or drop an image / HEIC / PDF / DOCX, choose a target, then **Download** or **Drag out**. Use **Open converter panel** for reliable drag onto a webpage.

## Conversion matrix

| Source | Targets | Engine |
|--------|---------|--------|
| JPEG / PNG / WebP / GIF / BMP | PNG, JPEG, WebP, PDF | Canvas + minimal PDF writer |
| HEIC / HEIF | JPEG, PNG, WebP | `heic2any` (WASM) via convert host |
| PDF | PNG / JPEG / WebP (page 1) | `pdf.js` via convert host |
| DOCX | plain text, HTML, text PDF | `mammoth` + text PDF writer |
| Images | PDF (single page) | Minimal JPEG-in-PDF writer |

Complex converts (HEIC / PDF→image / DOCX) run in a hidden extension-page iframe so WASM/workers stay under the extension CSP, not the host page CSP.

## Options

- **Enable SwiftConvert** — master switch
- **Preview before upload** — confirm each conversion (recommended for PDF/DOCX)
- **Quiet conversion toast** — brief on-page notice (**default: on**)
- **Preferred image format** — when a field accepts multiple image types (`auto` prefers PNG)

Covered fields show the SwiftConvert logo mark when the extension is enabled.

## Limitations

- PDF → image rasterizes **page 1 only** (scale 2×).
- DOCX → PDF is a **text-only** PDF (no layout / images from the Word file).
- HEIC bursts / animations: first frame / still only; metadata is not preserved.
- GIF conversion uses the frame decoded by the browser (typically the first frame).
- SVG is not converted.
- Dropzones with **no** accept hint cannot infer a target type.
- Dragging from the **toolbar popup** onto a page is unreliable in Chrome — use the detached converter panel.

## Project layout

```
manifest.json
icons/                 # PNG set + SVG source
src/
  background/
  content/             # page-hook (MAIN) + bridge (isolated)
  convert/             # hidden convert host (HEIC/PDF/DOCX libs)
  lib/converters/      # image, heic, pdf, docx, pdf-write, registry
  lib/vendor/          # heic2any, pdf.js, mammoth
  options/             # popup, options, manual converter
demo/
```

## Vendored libraries

See `src/lib/vendor/NOTICE.md` for licenses (`heic2any`, `pdf.js`, `mammoth`, Outfit font).
