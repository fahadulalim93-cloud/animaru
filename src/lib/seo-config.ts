/**
 * SEO settings — editable from the admin panel, stored in localStorage.
 *
 * NOTE: Next.js renders <head> metadata on the server, so these client-stored
 * settings drive (a) the admin SEO audit/score, (b) a live-injected JSON-LD +
 * meta preview, and (c) copy-ready tags. The static, always-on technical SEO
 * (sitemap.xml, robots.txt, base metadata, Organization/WebSite structured
 * data with a sitelinks SearchAction) lives in app/ and ships regardless.
 */

const KEY = "luffytv_seo";

export interface SeoSettings {
  siteName: string;
  title: string;
  description: string;
  keywords: string;      // comma separated
  ogImage: string;
  twitterHandle: string;
  canonicalUrl: string;
  robotsIndex: boolean;
}

export const DEFAULT_SEO: SeoSettings = {
  siteName: "Luffy TV",
  title: "Luffy TV — Watch Anime, Movies & TV Shows Free in HD",
  description:
    "Stream anime, movies, TV shows, manga & novels free in HD. Subbed & dubbed anime, trending movies and popular series — no signup required.",
  keywords:
    "anime, watch anime online, free anime streaming, movies, tv shows, manga, light novels, subbed anime, dubbed anime, hd streaming, luffy tv",
  ogImage: "/og.png",
  twitterHandle: "@luffytv",
  canonicalUrl: "https://luffytv.app",
  robotsIndex: true,
};

export function loadSeo(): SeoSettings {
  if (typeof window === "undefined") return DEFAULT_SEO;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SEO;
    return { ...DEFAULT_SEO, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SEO;
  }
}

export function saveSeo(s: SeoSettings) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}

export interface SeoCheck {
  id: string;
  label: string;
  ok: boolean;
  hint: string;
}

/** A lightweight SEO audit that scores the current settings. */
export function auditSeo(s: SeoSettings): { checks: SeoCheck[]; score: number } {
  const titleLen = s.title.trim().length;
  const descLen = s.description.trim().length;
  const kw = s.keywords.split(",").map((k) => k.trim()).filter(Boolean);
  const checks: SeoCheck[] = [
    { id: "title", label: "Title length 30–60 chars", ok: titleLen >= 30 && titleLen <= 60, hint: `Currently ${titleLen}. Search engines truncate long titles.` },
    { id: "desc", label: "Description 120–160 chars", ok: descLen >= 120 && descLen <= 160, hint: `Currently ${descLen}. Aim for a compelling 1–2 sentence summary.` },
    { id: "kw", label: "3–12 focused keywords", ok: kw.length >= 3 && kw.length <= 12, hint: `Currently ${kw.length}. Too few or keyword-stuffing both hurt.` },
    { id: "og", label: "Open Graph image set", ok: !!s.ogImage.trim(), hint: "Rich previews when shared drive click-through." },
    { id: "canonical", label: "Canonical URL set", ok: /^https?:\/\//.test(s.canonicalUrl.trim()), hint: "Prevents duplicate-content penalties." },
    { id: "twitter", label: "Twitter handle set", ok: !!s.twitterHandle.trim(), hint: "Enables Twitter Card attribution." },
    { id: "index", label: "Indexing enabled", ok: s.robotsIndex, hint: "The site must be indexable to rank." },
    { id: "brand", label: "Brand name in title", ok: s.title.toLowerCase().includes(s.siteName.toLowerCase()), hint: "Reinforces brand recognition in SERPs." },
  ];
  const score = Math.round((checks.filter((c) => c.ok).length / checks.length) * 100);
  return { checks, score };
}
