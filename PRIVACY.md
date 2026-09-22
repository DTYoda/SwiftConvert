# SwiftConvert Privacy Policy

**Last updated:** 2026-09-22  
**Product:** SwiftConvert browser extension  
**Contact:** [GitHub Issues](https://github.com/DTYoda/SwiftConvert/issues)

## Summary

SwiftConvert converts and compresses files **entirely on your device**. Your files are **not uploaded** to SwiftConvert servers. We do not operate a SwiftConvert backend that receives your uploads.

## What the extension does

When you choose a file on a webpage (or use the built-in Tools panel), SwiftConvert may:

- Read the file in the browser to convert formats or shrink oversized images
- Replace the upload with a locally processed copy when auto-convert / auto-compress is enabled
- Show optional on-page notices and a before/after preview

All of that processing runs in your browser / extension pages (including WASM libraries such as libheif, PDF.js, and ffmpeg.wasm that ship **inside** the extension package).

## Data we do not collect

SwiftConvert does **not**:

- Send your files to a SwiftConvert remote server
- Sell or share your files with third parties
- Use analytics SDKs that upload file contents
- Require an account

## Permissions and why they exist

| Permission | Purpose |
|------------|---------|
| `storage` | Save your settings (auto-convert, compress quality, preferred formats, etc.) locally in the browser |
| `activeTab` | Interact with the tab you are using when needed for upload handling |
| Host access (`<all_urls>` / matching http(s)/file pages) | Detect upload fields and size-limit hints on the pages where you upload files, and inject the content scripts that perform convert/compress |

Host access is used to **read page structure and file inputs you interact with**, not to scrape unrelated browsing history for advertising.

## What is stored locally

Settings are stored with the browser’s extension storage API (for example: toggles for auto-convert / auto-compress, compress quality, preferred image format, notice preferences). Settings do not include the contents of your files.

Temporary conversion work happens in memory (and ephemeral extension-page contexts). Processed files are only written where you choose (download, drag-out, or as the replacement upload).

## Third-party libraries

Conversion engines are **vendored in the extension** and run locally. See [`src/lib/vendor/NOTICE.md`](src/lib/vendor/NOTICE.md) for licenses (libheif-js, PDF.js, mammoth, JSZip, ffmpeg.wasm, Outfit font).

Audio/video conversion uses a large ffmpeg.wasm module that loads on first A/V use; that load is from the **packaged extension files**, not from a SwiftConvert cloud API.

## Children

SwiftConvert is a general-purpose productivity tool. It is not directed at children under 13, and it does not knowingly collect personal information from children.

## Changes

We may update this policy when the extension’s privacy behavior changes. The canonical copy lives at:

https://github.com/DTYoda/SwiftConvert/blob/main/PRIVACY.md

## Contact

Questions or privacy requests: open an issue at https://github.com/DTYoda/SwiftConvert/issues.
