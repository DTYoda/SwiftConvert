#!/usr/bin/env node
/**
 * Rasterize SwiftConvert extension icons from SVG sources.
 *
 * - icon16: simplified mark.svg (readable at toolbar size)
 * - icon32+ / masters: logo.svg via high supersample → Lanczos downscale
 *   (vector → bitmap; never upscale a tiny PNG)
 *
 * Usage (from this directory):
 *   npm install
 *   npm run rasterize
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICONS = join(__dirname, "..");
const logoSvg = readFileSync(join(__dirname, "logo.svg"));
const markSvg = readFileSync(join(__dirname, "mark.svg"));

async function rasterize(svg, size, supersample = 4) {
  const hi = Math.max(size * supersample, size);
  const rendered = new Resvg(svg, {
    fitTo: { mode: "width", value: hi },
    background: "rgba(0,0,0,0)",
  })
    .render()
    .asPng();

  const buf = Buffer.from(rendered);
  if (hi === size) {
    return sharp(buf).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  }
  return sharp(buf)
    .resize(size, size, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function writeIcon(name, buffer) {
  const dest = join(ICONS, name);
  writeFileSync(dest, buffer);
  console.log(`wrote ${name} (${buffer.length} bytes)`);
}

async function main() {
  await writeIcon("icon512.png", await rasterize(logoSvg, 512, 1));
  await writeIcon("icon256.png", await rasterize(logoSvg, 256, 4));
  await writeIcon("icon128.png", await rasterize(logoSvg, 128, 4));
  await writeIcon("icon48.png", await rasterize(logoSvg, 48, 8));
  await writeIcon("icon32.png", await rasterize(logoSvg, 32, 8));
  // Toolbar / badge size: simplified mark stays legible at 16px
  await writeIcon("icon16.png", await rasterize(markSvg, 16, 8));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
