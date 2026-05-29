/**
 * macOS dock icon: dark squircle (like system apps) + muted white grid glyph.
 */
import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const GRID_SRC = path.join(ROOT, "public/icon.png");
const OUT = path.join(ROOT, "src-tauri/app-icon.png");
const SIZE = 1024;
const RADIUS = 226;

/** Muted opaque white for glyph on dark background */
const GLYPH = { r: 232, g: 234, b: 238 };

async function whiteGlyphFromGrid(srcPath, size) {
  const { data, info } = await sharp(srcPath)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 20) {
      out[i + 3] = 0;
      continue;
    }
    out[i] = GLYPH.r;
    out[i + 1] = GLYPH.g;
    out[i + 2] = GLYPH.b;
    out[i + 3] = a;
  }

  return sharp(out, {
    raw: { width: info.width, height: info.height, channels: 4 },
  }).png().toBuffer();
}

async function main() {
  const gridSize = Math.round(SIZE * 0.5);
  const grid = await whiteGlyphFromGrid(GRID_SRC, gridSize);

  const squircleSvg = `
<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#3a3a40"/>
      <stop offset="100%" stop-color="#222226"/>
    </linearGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.10"/>
      <stop offset="50%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="none"/>
  <rect x="8" y="8" width="${SIZE - 16}" height="${SIZE - 16}" rx="${RADIUS}" fill="url(#bg)"/>
  <rect x="8" y="8" width="${SIZE - 16}" height="${SIZE - 16}" rx="${RADIUS}" fill="url(#shine)"/>
  <rect x="8" y="8" width="${SIZE - 16}" height="${SIZE - 16}" rx="${RADIUS}"
    fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="8"/>
  <rect x="15" y="15" width="${SIZE - 30}" height="${SIZE - 30}" rx="${RADIUS - 7}"
    fill="none" stroke="rgba(0,0,0,0.45)" stroke-width="5"/>
  <rect x="22" y="22" width="${SIZE - 44}" height="${SIZE - 44}" rx="${RADIUS - 14}"
    fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="2"/>
</svg>`;

  const base = await sharp(Buffer.from(squircleSvg)).png().toBuffer();
  const offset = Math.round((SIZE - gridSize) / 2);

  await sharp(base)
    .composite([{ input: grid, left: offset, top: offset }])
    .png()
    .toFile(OUT);

  console.log(`Wrote ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
