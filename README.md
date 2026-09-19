# SwiftConvert

Browser extension that intercepts file uploads and converts mismatched files to the format a site expects — for example JPG → PNG, HEIC → JPEG, PDF → PNG, or DOCX → text — and can **auto-compress** oversized images when a size limit is detected.

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
5. On **Auto-compress (size limit)**, choose `demo/sample-large.jpg` — result should be ≤ 80 KB.
6. Also try `sample.heic` on HEIC→JPEG, `sample.pdf` on PDF→PNG, and `sample.docx` on DOCX→text.

Converter self-test (no extension required for the convert host libs): [http://127.0.0.1:8765/demo/self-test.html](http://127.0.0.1:8765/demo/self-test.html) should show `ALL PASS`.

### Manual converter & compressor

Toolbar popup includes **Convert** and **Compress** tabs: pick or drop a file, then **Download** or **Drag out**. Use **Open tools panel** for reliable drag onto a webpage.

## Conversion matrix

| Source | Targets | Engine |
|--------|---------|--------|
| JPEG / PNG / WebP / GIF / BMP | PNG, JPEG, WebP, PDF | Canvas + minimal PDF writer |
| HEIC / HEIF | JPEG, PNG, WebP | `heic2any` (WASM) via convert host |
| PDF | PNG / JPEG / WebP (page 1) | `pdf.js` via convert host |
| DOCX | plain text, HTML, text PDF | `mammoth` + text PDF writer |
| Images | PDF (single page) | Minimal JPEG-in-PDF writer |
| Oversized images | Same type (or JPEG when chasing a byte budget) | Canvas quality + resize |

Complex converts (HEIC / PDF→image / DOCX) run in a hidden extension-page iframe so WASM/workers stay under the extension CSP, not the host page CSP. PDF.js and heic2any workers are packaged files (`pdf.worker.min.mjs`, `heic2any.worker.js`) — Chrome MV3 forbids `blob:` in `worker-src` for extension pages. Image compression uses canvas only (no workers).

## Auto-compress (detect-first)

Pipeline: **convert format first** (if needed), then **compress** if the file still exceeds a size limit.

Limits are inferred from (in order):

1. Attributes on the input / drop host / form: `data-max-size`, `data-maxfilesize`, `data-max-filesize`, `data-maxsize`, `max`, and similar.
2. Nearby copy such as “max 2MB”, “Maximum upload size: 5 MB”, “up to 500 KB”.
3. Optional **default max (MB)** — only when **Use default max when no limit found** is enabled in settings.

By default SwiftConvert does **not** compress unless a limit is detected (detect-first). Quiet toast can mention compression and before/after sizes.

## Options

- **Enable SwiftConvert** — master switch
- **Preview before upload** — confirm each conversion (recommended for PDF/DOCX)
- **Quiet conversion toast** — brief on-page notice (**default: on**)
- **Auto-compress** — shrink oversized images when a limit is found (**default: on**)
- **Use default max when no limit found** — optional fallback (**default: off**, detect-first)
- **Default max size (MB)** — used only with the fallback above
- **Compress quality** — high / balanced / smaller file
- **Preferred image format** — when a field accepts multiple image types (`auto` prefers PNG)

Covered fields show the SwiftConvert logo mark when the extension is enabled.

## Limitations

- PDF → image rasterizes **page 1 only** (scale 2×).
- DOCX → PDF is a **text-only** PDF (no layout / images from the Word file).
- HEIC bursts / animations: first frame / still only; metadata is not preserved.
- GIF conversion uses the frame decoded by the browser (typically the first frame).
- SVG is not converted.
- Dropzones with **no** accept hint cannot infer a target type.
- Auto-compress needs a detectable size limit (or the optional default-max setting).
- Dragging from the **toolbar popup** onto a page is unreliable in Chrome — use the detached tools panel.

## Project layout

```
manifest.json
icons/                 # PNG set + SVG source
src/
  background/
  content/             # page-hook (MAIN) + bridge (isolated)
  convert/             # hidden convert host (HEIC/PDF/DOCX libs)
  lib/                 # mime, compress, size-limit
  lib/converters/      # image, heic, pdf, docx, pdf-write, registry
  lib/vendor/          # heic2any, pdf.js, mammoth
  options/             # popup, options, converter + compressor
demo/
```

## Vendored libraries

See `src/lib/vendor/NOTICE.md` for licenses (`heic2any`, `pdf.js`, `mammoth`, Outfit font).
