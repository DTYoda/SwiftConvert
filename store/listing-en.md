# SwiftConvert — English store listing

Use this copy for Chrome Web Store and Firefox AMO.

## Short description (≤ 132 characters)

```
Convert mismatched uploads and compress oversized images on-device so files fit what the site accepts.
```

Character count: 102

## Detailed description

```
SwiftConvert helps you upload the file you already have.

When a site asks for PNG and you only have a JPG — or rejects an oversized photo — SwiftConvert converts and compresses right in your browser. Your files never leave your device. There is no SwiftConvert cloud upload.

WHAT IT DOES
• Auto-convert mismatched uploads to the format the field accepts (images, HEIC, PDF, DOCX, office extracts, and audio/video via packaged ffmpeg.wasm)
• Auto-compress oversized images when a size limit is detected on the page
• Optional before/after preview — Accept the new file or keep the original
• Manual Tools panel for convert and/or compress, then download or drag onto a page
• Optional field badges and activity notices (including a first-load notice for A/V FFmpeg)

PRIVACY
All conversion runs locally in the extension. Settings are stored only in your browser. See the privacy policy linked on this listing.

LIMITATIONS (honest)
• Document layout (DOCX→PDF/PNG) is best-effort visual render, not Word-perfect
• PDF→image uses page 1 by default; multi-page ZIP is capped
• Audio/video uses a practical ffmpeg.wasm subset; the first A/V convert can be slow while FFmpeg loads
• Sites with no accept / size hints cannot be inferred automatically

PERMISSIONS
• Access to websites: detect upload fields and process the files you choose on those pages
• Storage: save your preferences
• Active tab: work with the page you are uploading on

Open-source MIT. Source and policy: https://github.com/DTYoda/SwiftConvert
```

## Permission justifications (store questionnaires)

### Host permissions / “Read and change all your data on websites you visit” / `<all_urls>`

SwiftConvert must run on the pages where you upload files so it can detect file inputs and dropzones, read accept/size-limit hints, convert or compress the file you selected, and optionally show badges, activity notices, and a before/after preview. It does not scrape unrelated browsing history and does not send file contents to SwiftConvert servers.

### `storage`

Stores user preferences only (auto-convert, auto-compress, quality, preferred formats, notice/badge toggles). Does not store uploaded file contents.

### `activeTab`

Allows the extension to cooperate with the tab you are actively using when handling an upload or opening tools related to that page.

### Remote code / network

Conversion libraries (including ffmpeg.wasm) are **packaged inside the extension**. SwiftConvert does not fetch executable conversion code from the network at runtime for its core pipeline.

## Single purpose statement

Convert and compress user-selected upload files on-device so they match a website’s accepted formats and size limits.

## Category

Productivity
