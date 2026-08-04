// Avatar frames — PNG-only overlay system.
//
// All frames are PNG/SVG overlays from /public/frames, picked up automatically
// via the manifest (rebuilt on every dev/build by scripts/generate-frames.mjs).
// Drop image files into public/frames and they appear with no code changes.
//
// The only "built-in" entry is "none" (no frame).
// CSS-based frame styling has been completely removed — all frames are PNG overlays.
//
// Stored user selections use stable keys:
//   PNG files: "f8" (8.png), "c32" (collectible_32.png), "horns" (horns.svg)
import manifest from "./frames-manifest.json";

export interface FrameDef {
  key: string;
  name: string;
  src: string | null;        // PNG/SVG overlay URL (null for "none")
  thumb: string | null;      // Small webp preview for pickers (null for "none")
}

interface ManifestEntry {
  file: string;
  thumb: string;
}

// ── Built-in entries (only "none" — no CSS frames) ──

const BUILTIN_FRAMES: FrameDef[] = [
  {
    key: "none",
    name: "None",
    src: null,
    thumb: null,
  },
];

// Friendly names for PNG frame files. Files not listed here get auto-labels.
const CURATED_NAMES: Record<string, string> = {
  "horns.svg": "Blaze Horns",
  "neon.svg": "Neon Halo",
  "frost.svg": "Frostbite",
  "1.png": "Amethyst Vine",
  "2.png": "Yin-Yang Surge",
  "3.png": "Molten Ring",
  "4.png": "Iron Tusk",
  "5.png": "Blaze Horns II",
  "6.png": "Rose Horns",
  "7.png": "Arcane Spark",
  "8.png": "Sakura Branch",
  "9.png": "Bone Circlet",
  "10.png": "Crimson Fang",
  "11.png": "Solar Crown",
  "12.png": "Violet Mist",
  "13.png": "Golden Laurel",
  "15.png": "Phoenix Wings",
  "16.png": "Thorned Crown",
  "17.png": "Verdant Surge",
  "18.png": "Aqua Surge",
  "19.png": "Rose Surge",
  "20.png": "Blue Vortex",
  "21.png": "Violet Vortex",
  "22.png": "Gearwork Ring",
  "23.png": "Crystal Twins",
  "24.png": "Golden Twins",
  "25.png": "Dusk Halo",
  "26.png": "Frost Horns",
  "27.png": "Tidal Ring",
  "28.png": "Sakura Ink",
  "29.png": "Storm Claw",
  "30.png": "Ember Blade",
  "31.png": "Star Kitten",
};

const stripExt = (file: string) => file.replace(/\.[^.]+$/, "");

// Stable key for a filename. Keep in sync with the doc comment above so
// previously-stored user selections keep resolving.
export const keyForFrameFile = (file: string): string => {
  const base = stripExt(file);
  const collectible = base.match(/^collectible[_-]?(\d+)$/i);
  if (collectible) return `c${collectible[1]}`;
  if (/^\d+$/.test(base)) return `f${base}`;
  return base;
};

const nameForFrameFile = (file: string): string => {
  if (CURATED_NAMES[file]) return CURATED_NAMES[file];
  const base = stripExt(file);
  const collectible = base.match(/^collectible[_-]?(\d+)$/i);
  if (collectible) return `Collectible ${collectible[1]}`;
  if (/^\d+$/.test(base)) return `Frame ${base}`;
  return base.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};

const entries = manifest as ManifestEntry[];

// Build the full FRAMES list: "none" + PNG overlay frames from manifest
export const FRAMES: FrameDef[] = [
  ...BUILTIN_FRAMES,
  ...entries.map(({ file, thumb }) => ({
    key: keyForFrameFile(file),
    name: nameForFrameFile(file),
    src: `/frames/${file}`,
    thumb: `/frames/${thumb}`,
  })),
];

// ── Lookup map ──

const KEY_TO_SRC: Record<string, string> = {};
for (const f of FRAMES) {
  if (f.src && !(f.key in KEY_TO_SRC)) KEY_TO_SRC[f.key] = f.src;
}

const KEY_TO_DEF: Record<string, FrameDef> = {};
for (const f of FRAMES) {
  if (!(f.key in KEY_TO_DEF)) KEY_TO_DEF[f.key] = f;
}

/** Get the PNG/SVG overlay URL for a frame key (null for "none"). */
export const frameSrcOf = (key?: string): string | null =>
  (key && KEY_TO_SRC[key]) || null;

/** Get the full FrameDef for any frame key. */
export const frameDefOf = (key?: string): FrameDef | null =>
  (key && KEY_TO_DEF[key]) || null;
