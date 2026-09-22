# Store submission handoff (Chrome + Firefox)

This document is for **you (Hayden)** after the GitHub Release is published. Upload, payment, and KYC cannot be automated from this repo.

**Privacy policy URL (use exactly):**  
https://github.com/DTYoda/SwiftConvert/blob/main/PRIVACY.md

**Package:** `dist/swiftconvert-1.0.0.zip` (from `scripts/pack-extension.sh`)  
**Firefox gecko id:** `swiftconvert@dtyoda.dev` (must match `manifest.json`)  
**Listing copy:** [`store/listing-en.md`](store/listing-en.md)  
**Screenshots:** [`store/screenshots/`](store/screenshots/)  
**Promo / icons note:** [`store/promo/README.md`](store/promo/README.md)

---

## Chrome Web Store

1. Pay the **$5 one-time** [Chrome Web Store Developer](https://chrome.google.com/webstore/devconsole) registration fee (Google account + payment).
2. **New item** → upload `swiftconvert-1.0.0.zip`.
3. Paste **short** and **detailed** descriptions from `store/listing-en.md`.
4. Upload **3–5 screenshots** from `store/screenshots/` (prefer 1280×800).
5. Category: **Productivity**. Language: English.
6. Store icon: use `icons/icon128.png` (CWS listing icon); see `store/promo/README.md` for small/large tile sizes if you generate tiles later.
7. **Privacy practices**
   - Single purpose: convert/compress uploads to match site requirements, on-device.
   - Paste permission justifications from `store/listing-en.md`.
   - Privacy policy URL = GitHub `PRIVACY.md` link above.
   - Confirm: no remote code, no selling user data, files processed locally.
8. Submit for review. Broad host permissions (`<all_urls>`) usually mean **manual review** — expect several business days.

### After Chrome approval

- Add the live CWS URL to the README “Install” section.
- Optional later: publish to Microsoft Edge Add-ons via Partner Center import from CWS.

---

## Firefox Add-ons (AMO)

1. Create a developer account at [addons.mozilla.org/developers](https://addons.mozilla.org/developers/).
2. Submit **`swiftconvert-1.0.0.zip`** (same curated package). Temporary add-on loading is **not** the store path.
3. Use the same listing text and privacy URL.
4. Confirm gecko id **`swiftconvert@dtyoda.dev`** matches the uploaded manifest.
5. For source / review notes: point reviewers at this GitHub repo; call out vendored WASM under `src/lib/vendor/` (see `NOTICE.md`). ffmpeg.wasm is large (~32 MB WASM) and loads from packaged files on first A/V convert.
6. Optional: build/sign with [`web-ext`](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/) locally for extra confidence; AMO can also sign on submission.

---

## Checklist before each upload

- [ ] `manifest.json` version matches the ZIP name
- [ ] Privacy URL resolves on `main`
- [ ] Screenshots and listing text reviewed
- [ ] ZIP rebuilt with `./scripts/pack-extension.sh` from a clean tree
- [ ] No `demo/` fixtures or `node_modules` inside the ZIP

## Rebuild the store ZIP

```bash
chmod +x scripts/pack-extension.sh
./scripts/pack-extension.sh
# → dist/swiftconvert-1.0.0.zip
```
