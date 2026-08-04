import type { MetadataRoute } from "next";

const BASE = "https://luffytv.app";

// The app is a hash-routed SPA, so the crawlable surface is the primary
// section landing pages. Hash fragments (#anime/…) aren't independently
// indexable, but listing the sections maximizes coverage of the entry points.
const SECTIONS = ["", "home", "movies", "tv", "manga", "novel", "live", "hub", "guide", "features", "contact"];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return SECTIONS.map((s) => ({
    url: s ? `${BASE}/#${s}` : BASE,
    lastModified: now,
    changeFrequency: s === "" || s === "home" ? "daily" : "weekly",
    priority: s === "" ? 1 : s === "home" ? 0.9 : 0.7,
  }));
}
