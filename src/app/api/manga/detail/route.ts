import { NextRequest, NextResponse } from "next/server";
import {
  getMangaDetail,
  searchManga,
  searchMangaMangaball,
  getMangaDetail as getDetail,
  getAtsumaruChaptersFast,
} from "@/lib/manga-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30; // allow time for cross-provider parallel fetches

/**
 * GET /api/manga/detail?id={mangaId}&title={fallbackTitle}
 *
 * Cross-provider chapter merge (ALL done server-side in parallel):
 *
 *   at: manga  →  atsumaru chapters (English)  +  mangaball chapters (ALL languages)
 *   mb: manga  →  mangaball chapters (ALL languages)  +  atsumaru chapters (English)
 *   cx: manga  →  comix chapters (English)  +  atsumaru (English)  +  mangaball (ALL languages)
 *
 * The mangaball direct scraper (getMangaballChaptersDirect) fetches ALL
 * language translations from mangaball.net's own API — this is what
 * provides multi-language support (en, es-419, fr, id, it, pt-br, vi,
 * de, ka, he, ms, etc.).
 *
 * All cross-provider fetches run in parallel where possible.
 */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  const fallbackTitle = request.nextUrl.searchParams.get("title") || "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    // ── Step 1: Fetch primary detail ──
    const detail = await getMangaDetail(id);

    if (!detail) {
      return NextResponse.json({ error: "Manga not found" }, { status: 404 });
    }

    // ── Step 2: Cross-provider metadata fallback ──
    // If detail has no genres/description, search atsumaru by title
    // and merge metadata. Runs for all providers.
    if (fallbackTitle && !detail.genres?.length && !detail.description) {
      try {
        const atsuResults = await searchManga(fallbackTitle, 3);
        const match = atsuResults.find(r =>
          (r.englishTitle || r.title).toLowerCase().includes(fallbackTitle.toLowerCase()) ||
          fallbackTitle.toLowerCase().includes((r.englishTitle || r.title).toLowerCase())
        ) || atsuResults[0];

        if (match) {
          const atsuDetail = await getDetail(match.id);
          if (atsuDetail) {
            if (!detail.description && atsuDetail.description) {
              detail.description = atsuDetail.description;
            }
            if (!detail.genres?.length && atsuDetail.genres?.length) {
              detail.genres = atsuDetail.genres;
              detail.tags = atsuDetail.tags;
            }
            if (detail.title === "Unknown Title" && atsuDetail.title) {
              detail.title = atsuDetail.title;
              detail.englishTitle = atsuDetail.englishTitle;
            }
            if (!detail.poster && atsuDetail.poster) {
              detail.poster = atsuDetail.poster;
              detail.cover = atsuDetail.cover;
            }
            if (!detail.anilistId && atsuDetail.anilistId) {
              detail.anilistId = atsuDetail.anilistId;
            }
          }
        }
      } catch (err) {
        console.error("[manga/detail] metadata fallback error:", err);
      }
    }

    // ── Step 3: Cross-provider CHAPTER merge ──
    // Search BOTH providers in parallel for the title, then merge chapters
    // from the "other" provider(s) into the primary detail.
    //
    // at: → fetch mangaball chapters (ALL languages — this is the
    //       multi-language source)
    // mb: → fetch atsumaru English chapters
    // cx: → fetch BOTH atsumaru (English) + mangaball (ALL languages)
    const titleForSearch = fallbackTitle || detail.englishTitle || detail.title || "";

    if (titleForSearch && titleForSearch !== "Unknown Title" && detail.chapters?.length) {
      try {
        // ── Parallel search: search BOTH providers at once ──
        // atsu.moe ALWAYS runs as an extra English source (even for at: manga)
        // to catch any extra chapters the primary provider might be missing.
        const [atsuResults, mbResults] = await Promise.all([
          searchManga(titleForSearch, 5),
          // Only search mangaball if we're NOT already a mb: manga
          id.startsWith("mb:") ? Promise.resolve([]) : searchMangaMangaball(titleForSearch),
        ]);

        // ── Parallel detail fetch: fetch matching manga from the OTHER provider(s) ──
        const mergePromises: Promise<{ type: "at" | "mb"; chapters: any[]; detail?: any }>[] = [];

        console.log(`[manga/detail] cross-provider search for "${titleForSearch}" (primary=${id}): atsuResults=${atsuResults.length}, mbResults=${mbResults.length}`);

        // If we're NOT at: (or we are, but want to merge extra atsu chapters),
        // find the atsumaru match and fetch its detail
        if (atsuResults.length > 0) {
          const atMatch = atsuResults.find(r => {
            const rTitle = (r.englishTitle || r.title || "").toLowerCase();
            const sTitle = titleForSearch.toLowerCase();
            return rTitle.includes(sTitle) || sTitle.includes(rTitle) ||
                   rTitle.slice(0, 20) === sTitle.slice(0, 20);
          }) || atsuResults[0];

          if (atMatch) {
            const atsuMangaId = atMatch.id.replace(/^at:/, "");
            // Skip if this is the same manga we already have (avoids duplicate chapters)
            if (id !== `at:${atsuMangaId}`) {
              console.log(`[manga/detail] merging atsumaru: at:${atsuMangaId} ("${atMatch.title}")`);
              // Use FAST chapters fetch (scrape-api only, ~0.3s) instead of
              // full getDetail (which triggers slow atsu.moe direct scraper).
              // Also fetch full detail in parallel for metadata (but don't block on it).
              mergePromises.push(
                Promise.all([
                  getAtsumaruChaptersFast(atsuMangaId),
                  getDetail(`at:${atsuMangaId}`).catch(() => null),
                ]).then(([chapters, d]) => {
                  const mapped = chapters.map((ch: any) => ({
                    ...ch,
                    id: `at:${atsuMangaId}:${ch.number}:${ch.id}`,
                    lang: "en",
                  }));
                  console.log(`[manga/detail] atsumaru merge: ${mapped.length} chapters from at:${atsuMangaId}`);
                  return { type: "at" as const, chapters: mapped, detail: d };
                }).catch((err) => {
                  console.error(`[manga/detail] atsumaru merge FAILED for at:${atsuMangaId}:`, err?.message || err);
                  return { type: "at" as const, chapters: [] };
                })
              );
            } else {
              console.log(`[manga/detail] atsumaru match is same as primary, skipping merge`);
            }
          } else {
            console.log(`[manga/detail] no atsumaru match found`);
          }
        }

        // If we're at: or cx:, find the mangaball match and fetch its detail
        // THIS is the key multi-language fetch — getMangaballChaptersDirect
        // is called inside getMangaDetail for mb: IDs and returns ALL
        // language translations.
        if (!id.startsWith("mb:") && mbResults.length > 0) {
          const mbMatch = mbResults[0]; // mangaball results are already prefixed with mb:
          if (mbMatch) {
            mergePromises.push(
              getDetail(mbMatch.id).then(d => ({
                type: "mb" as const,
                chapters: d?.chapters || [],
                detail: d,
              })).catch(err => {
                console.error("[manga/detail] mangaball fetch failed (multi-language):", err?.message || err);
                return { type: "mb" as const, chapters: [] };
              })
            );
          }
        }

        // ── Wait for all parallel fetches to complete ──
        const merges = await Promise.all(mergePromises);

        // ── Merge chapters: atsumaru English first, then mangaball ALL languages ──
        const atsuChapters = merges.find(m => m.type === "at")?.chapters || [];
        const mbChapters = merges.find(m => m.type === "mb")?.chapters || [];
        const mbDetail = merges.find(m => m.type === "mb")?.detail;
        const atsuDetail = merges.find(m => m.type === "at")?.detail;

        if (atsuChapters.length > 0 || mbChapters.length > 0) {
          // Merge: start with the PRIMARY manga's chapters (already in detail.chapters),
          // then APPEND atsumaru + mangaball merge chapters (deduped).
          // This preserves the primary's chapters instead of replacing them.
          const seen = new Set<string>();
          const allChapters = [...detail.chapters, ...atsuChapters, ...mbChapters].filter(ch => {
            const key = `${Math.round(ch.number * 100) / 100}:${ch.lang || "en"}:${ch.scanGroup || ""}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          }).sort((a, b) => a.number - b.number);

          console.log(`[manga/detail] merge for ${id}: primary=${detail.chapters.length}, atsumaru=${atsuChapters.length}, mangaball=${mbChapters.length}, total=${allChapters.length}`);

          detail.chapters = allChapters;
          detail.totalChapters = allChapters.length;

          // Merge metadata from the other provider if still missing
          if (mbDetail) {
            if (!detail.description && mbDetail.description) {
              detail.description = mbDetail.description;
            }
            if (!detail.genres?.length && mbDetail.genres?.length) {
              detail.genres = mbDetail.genres;
              detail.tags = mbDetail.tags;
            }
            if (!detail.poster && mbDetail.poster) {
              detail.poster = mbDetail.poster;
              detail.cover = mbDetail.cover;
            }
          }
          if (atsuDetail) {
            if (!detail.description && atsuDetail.description) {
              detail.description = atsuDetail.description;
            }
            if (!detail.genres?.length && atsuDetail.genres?.length) {
              detail.genres = atsuDetail.genres;
              detail.tags = atsuDetail.tags;
            }
            if (!detail.anilistId && atsuDetail.anilistId) {
              detail.anilistId = atsuDetail.anilistId;
            }
          }

          console.log(`[manga/detail] cross-provider merge for ${id}: atsumaru=${atsuChapters.length} ch, mangaball=${mbChapters.length} ch, total=${allChapters.length} ch`);
        }
      } catch (err) {
        console.error("[manga/detail] cross-provider chapter merge error:", err);
      }
    }

    return NextResponse.json(detail);
  } catch (err) {
    console.error("[manga/detail] fatal error:", err);
    return NextResponse.json({ error: "Failed to fetch manga details" }, { status: 500 });
  }
}
