# Third-party notices

SwiftConvert vendors the following client-side libraries for conversion and branding.

## libheif-js

- Package: `libheif-js` (WASM bundle of strukturag/libheif)
- Files: `libheif-bundle.js`, `libheif-LICENSE.txt`
- License: LGPL-3.0 (libheif) — see `libheif-LICENSE.txt`
- https://github.com/catdad-experiments/libheif-js
- Chosen over `heic2any` because Chrome MV3 extension pages cannot allow `unsafe-eval`; libheif’s WASM build works with `wasm-unsafe-eval` only.

## PDF.js

- Package: `pdfjs-dist` (Mozilla)
- Files: `pdf.min.mjs`, `pdf.worker.min.mjs`
- License: Apache-2.0
- https://github.com/mozilla/pdf.js

## mammoth

- Package: `mammoth` (Michael Williamson)
- File: `mammoth.browser.min.js`
- License: BSD-2-Clause
- https://github.com/mwilliamson/mammoth.js

## Outfit font

- Files: `src/assets/fonts/Outfit-*.woff2`
- License: SIL Open Font License 1.1
- https://fonts.google.com/specimen/Outfit
