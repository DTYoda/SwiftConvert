# Store screenshots

Captured at **1280×800** for Chrome Web Store / Firefox AMO.

| File | Subject |
|------|---------|
| `01-demo-upload.png` | Demo page — native upload + convert story |
| `02-tools-panel.png` | Tools UI — convert/compress, FFmpeg notice, privacy line |
| `03-settings.png` | Settings — toggles + privacy policy link |
| `04-self-test.png` | Converter self-test PASS output (developer confidence) |
| `05-preview-slider.png` | Before/after preview mock (Accept / Keep original) |

Re-capture (with local server on port 8765):

```bash
python3 -m http.server 8765 --bind 127.0.0.1
# then headless Chrome --window-size=1280,800 --screenshot=...
```

`preview-mock.html` in the parent `store/` folder is a static mock used only to produce `05-preview-slider.png` when a live extension preview overlay is not available in headless mode.
