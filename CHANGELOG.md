# Changelog

All notable changes to SwiftConvert are documented here.

## [1.0.0] — 2026-09-22

### Store release

- Version **1.0.0** for Chrome Web Store and Firefox AMO submission
- Permanent Firefox gecko id: `swiftconvert@dtyoda.dev`
- Firefox-compatible background entry: `service_worker` + `scripts`
- Store packaging script: `scripts/pack-extension.sh` → `dist/swiftconvert-1.0.0.zip`
- Privacy policy, MIT license, store handoff docs, and listing assets under `store/`
- In-product privacy link and “files never leave your device” trust copy

### Features (carried from 0.4.x)

- Auto-convert mismatched uploads to accepted formats (images, HEIC, PDF, DOCX, office extracts, audio/video via ffmpeg.wasm)
- Auto-compress oversized images when a size limit is detected
- Optional preview-before-upload with before/after slider
- Manual Tools panel: convert and/or compress, download, drag-out
- Activity notices (including A/V first-load FFmpeg warning)
- Field badges on covered upload inputs
- Catalog chaining for shortest convert paths (e.g. HEIC → JPEG → PDF)

### Known limits

- DOCX visual PDF/PNG is HTML-render based (not Word-perfect)
- PDF → image defaults to page 1; ZIP export caps pages
- ffmpeg.wasm codec/container support is a practical subset; first A/V load is large/slow
- Drag-out from the toolbar popup is unreliable in Chrome — use the tools panel
