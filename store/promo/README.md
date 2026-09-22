# Promo / store icons

SwiftConvert ships raster icons under `/icons`. Use these for Chrome Web Store and AMO unless you export dedicated promo tiles later.

| Asset | Path | Typical use |
|-------|------|-------------|
| 16×16 | `icons/icon16.png` | Toolbar (Chrome) |
| 32×32 | `icons/icon32.png` | Windows / high-DPI toolbar |
| 48×48 | `icons/icon48.png` | Extensions management |
| 128×128 | `icons/icon128.png` | **CWS listing icon** (required) |
| 256×256 | `icons/icon256.png` | Marketing / README |
| 512×512 | `icons/icon512.png` | High-res source / promo base |

## Chrome Web Store promotional tiles (optional)

CWS can ask for additional promo images beyond the 128 icon:

| Tile | Size | Note |
|------|------|------|
| Small promo | 440×280 | Optional; can derive from logo + wordmark |
| Large promo | 920×680 | Optional; hero-style marketing |
| Marquee | 1400×560 | Rare / featured |

This folder intentionally does **not** duplicate binary tiles. For v1.0.0 submission:

1. Upload `icons/icon128.png` as the store icon.
2. Use screenshots in `../screenshots/` for the gallery.
3. If CWS requires small/large promo tiles, export from `icons/src/logo.svg` (or `icon512.png`) onto a 440×280 / 920×680 canvas with the brand teal (`#146b63`) and the product name — keep text readable; do not stretch the 128 icon.

## Firefox AMO

AMO uses the extension’s `icons` from the manifest (include 48 and 128 at minimum). Extra promotional screenshots come from `../screenshots/`.

## Regeneration

```bash
cd icons/src && npm install && npm run rasterize
```
