import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

async function main() {
  const appIconSvg = fs.readFileSync(path.join(ROOT, "src-tauri/app-icon.svg"));
  await sharp(appIconSvg)
    .resize(1024, 1024)
    .png()
    .toFile(path.join(ROOT, "src-tauri/app-icon.png"));
  console.log("✓ app-icon.png");

  const trayIconSvg = fs.readFileSync(path.join(ROOT, "src-tauri/icons/tray-icon.svg"));
  await sharp(trayIconSvg)
    .resize(44, 44)
    .png()
    .toFile(path.join(ROOT, "src-tauri/icons/tray-icon.png"));
  console.log("✓ tray-icon.png");
}

main().catch((e) => { console.error(e); process.exit(1); });
