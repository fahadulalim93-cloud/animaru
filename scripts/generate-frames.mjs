// Scans public/frames and writes src/components/anime/frames-manifest.json so
// any image dropped in public/frames is picked up automatically — no code edits.
//
// It also generates small webp thumbnails (public/frames/thumbs) with sharp so
// the frame picker loads tiny previews instead of the full-size art (some
// frames are several MB each). The equipped frame still uses the full image.
import { readdirSync, writeFileSync, readFileSync, mkdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const framesDir = join(root, "public", "frames");
const thumbsDir = join(framesDir, "thumbs");
const out = join(root, "src", "components", "anime", "frames-manifest.json");

const IMG = /\.(png|apng|svg|gif|webp|jpe?g|avif)$/i;
const THUMB_SIZE = 192;

// Natural sort so "2.png" < "10.png" and collectibles stay in numeric order.
const natural = (a, b) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

let files = [];
try {
  files = readdirSync(framesDir).filter((f) => IMG.test(f)).sort(natural);
} catch (e) {
  console.warn(`[frames] could not read ${framesDir}: ${e.message}`);
}

// sharp is optional — if it can't load, we fall back to full-size images.
let sharp = null;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.warn("[frames] sharp unavailable — thumbnails skipped, using full images");
}
if (sharp) {
  try {
    mkdirSync(thumbsDir, { recursive: true });
  } catch {}
}

const isFresh = (src, dst) => {
  try {
    return statSync(dst).mtimeMs >= statSync(src).mtimeMs;
  } catch {
    return false;
  }
};

const entries = [];
let made = 0;
for (const file of files) {
  const base = file.replace(/\.[^.]+$/, "");
  const src = join(framesDir, file);
  let thumb = `thumbs/${base}.webp`;
  const dst = join(thumbsDir, `${base}.webp`);
  if (sharp) {
    try {
      if (!isFresh(src, dst)) {
        await sharp(src)
          .resize(THUMB_SIZE, THUMB_SIZE, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 80 })
          .toFile(dst);
        made++;
      }
    } catch (e) {
      console.warn(`[frames] thumb failed for ${file}: ${e.message}`);
      thumb = file; // fall back to the full-size image
    }
  } else {
    thumb = file;
  }
  entries.push({ file, thumb });
}

const next = JSON.stringify(entries, null, 2) + "\n";
let prev = "";
try {
  prev = readFileSync(out, "utf8");
} catch {}
if (prev !== next) {
  writeFileSync(out, next);
}
console.log(`[frames] ${entries.length} frames, ${made} thumbnails generated`);
