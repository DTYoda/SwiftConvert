# SwiftConvert

Browser extension that intercepts file uploads and converts mismatched files to the format a site expects — for example JPG → PNG, HEIC → JPEG/PDF, PDF → PNG/text, DOCX → PNG/PDF, or audio/video via ffmpeg.wasm — and can **auto-compress** oversized images when a size limit is detected.

<img src="icons/icon256.png" alt="SwiftConvert logo" width="64" height="64" />

Invisible by default when auto-convert / auto-compress are on. Optional preview-before-upload for quality checks on complex converts. Activity notices (in progress + finished) are **on by default**.

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
3. Ensure **Auto-convert** (and **Auto-compress** for the size-limit fixture) are on in the toolbar popup **Settings** tab.
4. On **Native file input**, choose `demo/sample.jpg` — result should be PNG.
5. On **Auto-compress (size limit)**, choose `demo/sample-large.jpg` — result should be ≤ 80 KB.
6. Also try `sample.heic`, `sample.pdf`, `sample.docx`, `sample.wav`, and `sample.webm`.

Converter self-test (no extension required for the convert host libs): [http://127.0.0.1:8765/demo/self-test.html](http://127.0.0.1:8765/demo/self-test.html) should show `ALL PASS`. A/V cases lazy-load ffmpeg.wasm (first run can take a while).

### Manual tools

The popup and options UI split into **Settings** and **Tools**. On **Tools**, pick or drop a file, check **Convert** and/or **Compress**, then **Run**. Format options come from the conversion catalog for the selected file (including A/V). When both are enabled, convert runs first, then compress. After processing, a before/after wipe slider lets you **Accept** (enable download / drag-out) or **Cancel** (re-tweak). Use the dedicated tools panel for reliable drag onto a webpage.

### Preview before upload

When **Preview before upload** is on, automatic convert/compress shows the same before/after visualizer on the page (stacked above field badges). **Upload new file** continues with the processed file; **Keep original**, backdrop click, Escape, or a 60s timeout keeps the original and does not upload the change. While work is in progress, a corner notice describes what is happening (e.g. `Converting photo.heic to PNG…`); it hides when the preview/toast shows or on idle.

## Conversion matrix

| Source | Targets | Engine |
|--------|---------|--------|
| JPEG / PNG / WebP / GIF / BMP | PNG, JPEG, WebP, PDF | Canvas + minimal PDF writer |
| SVG | PNG, JPEG, WebP | Inline SVG → canvas |
| HEIC / HEIF | JPEG, PNG, WebP, **PDF** (via JPEG chain) | `libheif-js` WASM via convert host |
| PDF | PNG / JPEG / WebP (page 1), text, ZIP of pages (cap 20) | `pdf.js` (+ JSZip) via convert host |
| DOCX | text, HTML, **PNG/JPEG/WebP**, **PDF (layout best-effort)** | mammoth HTML → visual render in host |
| TXT / HTML / CSV | PDF, text | Lightweight writers |
| PPTX / XLSX | HTML / text / CSV / PDF | Best-effort JSZip + XML (not Office-faithful) |
| Audio (mp3/wav/ogg/m4a/aac/flac…) | Other audio; **video with black frames** (mp4/webm) | `ffmpeg.wasm` (lazy, convert host) |
| Video (mp4/webm/…) | Audio extract; video remux/transcode subset (mp4/webm) | `ffmpeg.wasm` (lazy, convert host) |
| Oversized images | Same type (or JPEG when chasing a byte budget) | Canvas quality + resize |

**Chaining:** if A→B and B→C exist, SwiftConvert runs the shortest path (e.g. HEIC→JPEG→PDF, DOCX→PNG is direct visual). Smart file-picker expansion still uses the site’s **original** accept for “needs convert?” decisions (v0.3.8 behavior preserved).

Complex converts (HEIC / PDF / DOCX visual / office / ffmpeg) run in a hidden extension-page iframe so WASM/workers stay under the extension CSP. HEIC uses `libheif-bundle.js` under `script-src 'self' 'wasm-unsafe-eval'`. PDF.js and ffmpeg use **packaged workers** (`pdf.worker.min.mjs`, `814.ffmpeg.js`) — Chrome MV3 forbids `blob:` in `worker-src` for extension pages. Image compression uses canvas only.

## Auto-compress (detect-first)

Pipeline: **convert format first** (if auto-convert is on and needed), then **compress** if auto-compress is on and the file still exceeds a size limit.

Limits are inferred from (in order):

1. Attributes on the input / drop host / form: `data-max-size`, `data-maxfilesize`, `data-max-filesize`, `data-maxsize`, `max`, and similar.
2. Nearby copy such as “max 2MB”, “Maximum upload size: 5 MB”, “up to 500 KB”.
3. Optional **default max (MB)** — only when **Use default max when no limit found** is enabled in settings.

By default SwiftConvert does **not** compress unless a limit is detected (detect-first). Activity notices can mention compression and before/after sizes.

## Options

Popup and options navigate between **Settings** and **Tools**.

**Settings**

- **Auto-convert** — convert mismatched uploads to the accepted format (**default: on**)
- **Auto-compress** — shrink oversized images when a limit is found (**default: on**)
- **Field badges** — SwiftConvert icon next to covered upload fields (**default: on**)
- **Activity notices** — corner notices during and after convert/compress (**default: on**; was “Quiet conversion toast”)
- **Preview before upload** — before/after slider; Accept uploads the new file, Cancel keeps the original
- **Use default max when no limit found** — optional fallback (**default: off**, detect-first)
- **Default max size (MB)** — used only with the fallback above
- **Compress quality** — high / balanced / smaller file
- **Preferred image format** — when a field accepts multiple image types (`auto` prefers PNG)

There is no global enable/disable — turn off auto-convert and auto-compress (and other toggles) to stop automatic behavior.

**Tools** — manual convert / compress with download and drag-out. Format list is catalog-driven; A/V shows a notice that the first ffmpeg load can be large/slow.

## Limitations

- DOCX → PDF/PNG is a **visual HTML render** (mammoth), not Word-perfect layout.
- PDF → image defaults to **page 1**; ZIP export caps at **20 pages**.
- PDF → DOCX is **not** offered (quality would be unusable).
- HEIC bursts / animations: first frame / still only; metadata is not preserved.
- GIF conversion uses the frame decoded by the browser (typically the first frame).
- PPTX / XLSX are best-effort text/structure extracts.
- ffmpeg.wasm codec/container support is a practical subset; first load downloads/compiles a large WASM module.
- Dropzones with **no** accept hint cannot infer a target type.
- Auto-compress needs a detectable size limit (or the optional default-max setting).
- Dragging from the **toolbar popup** onto a page is unreliable in Chrome — use the detached tools panel.

## Project layout

```
manifest.json
icons/                 # PNG set (16–512) + SVG source; regenerate via icons/src
src/
  background/
  content/             # page-hook (MAIN) + bridge (isolated)
  convert/             # hidden convert host (HEIC/PDF/DOCX/ffmpeg libs)
  lib/                 # mime, compress, size-limit
  lib/converters/      # catalog, registry, image, heic, pdf, docx, ffmpeg, …
  lib/vendor/          # libheif-js, pdf.js, mammoth, jszip, ffmpeg.wasm
  options/             # popup, options, converter tools
demo/
```

## Regenerating icons

PNG toolbar/store assets are rendered from `icons/src/logo.svg` (and `mark.svg` for 16×16):

```bash
cd icons/src && npm install && npm run rasterize
```

That writes `icon16.png` … `icon512.png` via resvg (vector → bitmap) and Lanczos downscales — never upscaling a tiny PNG.

## Vendored libraries

See `src/lib/vendor/NOTICE.md` for licenses (`libheif-js`, `pdf.js`, `mammoth`, `jszip`, `ffmpeg.wasm`, Outfit font).
