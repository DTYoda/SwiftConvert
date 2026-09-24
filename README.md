# SwiftConvert

<img src="icons/icon256.png" alt="SwiftConvert" width="72" height="72" />

**Match uploads. Compress to fit. Files never leave your device.**

SwiftConvert is a browser extension that intercepts file uploads and converts mismatched files to the format a site expects — JPG → PNG, HEIC → JPEG/PDF, PDF → image/text, DOCX → PNG/PDF, audio/video via ffmpeg.wasm — and can **auto-compress** oversized images when a size limit is detected.

[![Version](https://img.shields.io/badge/version-1.0.0-146b63)](https://github.com/DTYoda/SwiftConvert/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-1f8f84)](LICENSE)
[![Chrome](https://img.shields.io/badge/Chrome-Web%20Store%20prep-4285F4)](STORE.md)
[![Firefox](https://img.shields.io/badge/Firefox-AMO%20prep-FF7139)](STORE.md)
[![Privacy](https://img.shields.io/badge/privacy-on--device-0c1f2e)](PRIVACY.md)

Invisible by default when auto-convert / auto-compress are on. Optional preview-before-upload for quality checks. Activity notices are on by default.

## Install

### Chrome / Edge / Brave (unpacked — until the store listing is live)

1. Download the latest release ZIP from [Releases](https://github.com/DTYoda/SwiftConvert/releases), or clone this repo.
2. Open `chrome://extensions` (or `edge://extensions`) → enable **Developer mode**.
3. **Load unpacked** → select the folder that contains `manifest.json` (unzipped release or repo root).
4. Pin SwiftConvert from the toolbar for quick access.

**Web Store:** Chrome Web Store listing coming soon — see [`STORE.md`](STORE.md) for the publisher checklist. When live, the store link will replace unpacked install for most users.

### Firefox

1. Temporary test: `about:debugging` → This Firefox → **Load Temporary Add-on** → pick `manifest.json`.
2. **AMO:** store submission uses the same curated ZIP (`dist/swiftconvert-1.0.0.zip`). Temporary loading is not the store path — see [`STORE.md`](STORE.md).

After updating: reload the extension on the extensions page, then hard-refresh open tabs.

## Privacy

- Processing is **client-side only**. Files are **not uploaded** to SwiftConvert servers.
- Full policy: [`PRIVACY.md`](PRIVACY.md) · Canonical URL for stores: https://github.com/DTYoda/SwiftConvert/blob/main/PRIVACY.md
- Third-party notices: [`src/lib/vendor/NOTICE.md`](src/lib/vendor/NOTICE.md)

## Features

| Capability | Details |
|------------|---------|
| Auto-convert | Mismatched uploads → accepted format (images, HEIC, PDF, DOCX, office extracts, A/V) |
| Auto-compress | Oversized images when a size limit is detected (attributes or nearby “max 2MB” copy) |
| Preview | Optional before/after slider — Accept uploads the new file; Cancel keeps the original |
| Tools | Manual convert and/or compress, download, drag-out |
| Notices | Corner activity text (incl. FFmpeg first-load warning for A/V) |
| Badges | Optional icon next to covered upload fields |

### Conversion matrix

| Source | Targets | Engine |
|--------|---------|--------|
| JPEG / PNG / WebP / GIF / BMP | PNG, JPEG, WebP, PDF | Canvas + PDF writer |
| SVG | PNG, JPEG, WebP | Inline SVG → canvas |
| HEIC / HEIF | JPEG, PNG, WebP, PDF (via JPEG) | libheif WASM |
| PDF | PNG / JPEG / WebP (page 1), text, ZIP of pages (cap 20) | PDF.js + JSZip |
| DOCX | text, HTML, PNG/JPEG/WebP, PDF (layout best-effort) | mammoth → visual render |
| TXT / HTML / CSV | PDF, text | Lightweight writers |
| PPTX / XLSX | HTML / text / CSV / PDF | Best-effort extract |
| Audio / video | Other audio; video remux/transcode subset | ffmpeg.wasm (lazy) |
| Oversized images | Same type (or JPEG when chasing a byte budget) | Canvas quality + resize |

**Chaining:** shortest path when A→B and B→C exist (e.g. HEIC→JPEG→PDF).

## Limitations

- DOCX → PDF/PNG is a **visual HTML render**, not Word-perfect layout.
- PDF → image defaults to **page 1**; ZIP export caps at **20 pages**.
- PDF → DOCX is not offered.
- HEIC bursts / animations: first frame / still only; metadata is not preserved.
- GIF conversion uses the frame the browser decodes (typically the first).
- PPTX / XLSX are best-effort text/structure extracts.
- ffmpeg.wasm support is a practical subset; **first A/V load is large and can be slow**.
- Dropzones with **no** accept hint cannot infer a target type.
- Dragging from the **toolbar popup** onto a page is unreliable in Chrome — use the tools panel.

## Options

**Settings:** Auto-convert, Auto-compress, Field badges, Activity notices, Preview before upload, optional default max size, compress quality, preferred image format.

**Tools:** Pick or drop a file, Convert and/or Compress, Run, then Accept for download / drag-out.

Turn off auto-convert and auto-compress to stop automatic behavior.

## Links

- [Releases](https://github.com/DTYoda/SwiftConvert/releases) · [Issues](https://github.com/DTYoda/SwiftConvert/issues)
- [Privacy](PRIVACY.md) · [License (MIT)](LICENSE) · [Changelog](CHANGELOG.md) · [Store handoff](STORE.md)
- [Vendor NOTICE](src/lib/vendor/NOTICE.md) · [Listing copy](store/listing-en.md)

## Developers

Local demo and self-tests (not included in the store ZIP):

1. Serve the repo:

   ```bash
   python3 -m http.server 8765 --bind 127.0.0.1
   ```

2. Open [http://127.0.0.1:8765/demo/](http://127.0.0.1:8765/demo/) with the extension loaded.
3. Converter self-test: [http://127.0.0.1:8765/demo/self-test.html](http://127.0.0.1:8765/demo/self-test.html) (A/V cases lazy-load ffmpeg.wasm).

### Pack the store ZIP

```bash
./scripts/pack-extension.sh
# → dist/swiftconvert-1.0.0.zip  (excludes demo/, .git, node_modules)
```

### Project layout

```
manifest.json
icons/                 # PNG set (16–512) + SVG source under icons/src
src/                   # background, content, convert host, options, vendor
demo/                  # local fixtures (excluded from store ZIP)
store/                 # listing copy + screenshots for CWS/AMO
scripts/pack-extension.sh
```

### Regenerating icons

```bash
cd icons/src && npm install && npm run rasterize
```

Writes `icon16.png` … `icon512.png` via resvg — never upscaling a tiny PNG.
