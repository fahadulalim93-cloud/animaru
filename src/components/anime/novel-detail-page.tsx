"use client";

import { useState, useEffect } from "react";
import { useAppStore } from "./store";
import { coverUrl, type Novel, type NovelDetail } from "@/lib/novel-api";

// ============================================================
// NOVEL DETAIL PAGE — Novel info + chapter list
// Black + white theme (matches LuffyTV site)
// Powered by novelarchive.cc API
// ============================================================

interface NovelDetailProps {
  novelId: string;
  novelTitle: string;
  novelCover: string;
  novelAuthor: string;
  novelSource: string;
}

export default function NovelDetailPage({ novelId, novelTitle, novelCover }: NovelDetailProps) {
  const navigate = useAppStore(s => s.navigate);
  const [detail, setDetail] = useState<NovelDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [chapterSearch, setChapterSearch] = useState("");
  const [descExpanded, setDescExpanded] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/novels/${novelId}`);
        if (!res.ok) return;
        const data = await res.json();
        setDetail(data);
      } catch (e) {
        console.error("Novel detail error:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [novelId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-16 bg-black">
        <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center pt-16 gap-4 bg-black">
        <p className="text-white/60">Novel not found</p>
        <button onClick={() => navigate({ page: "novel" })} className="text-[#1e88ff] hover:underline text-sm">
          Back to Novels
        </button>
      </div>
    );
  }

  const novel: Novel = detail.novel;
  const cover = novelCover || coverUrl(novel, 500);
  const genres = (novel.genres || "").split(",").filter(Boolean);
  const totalChapters = parseInt(novel.total_chapters || "0") || 0;
  const chapterNames = detail.chapter_names || [];
  const filteredChapters = chapterSearch
    ? chapterNames.map((name, i) => ({ name, num: i + 1 })).filter(c => c.name.toLowerCase().includes(chapterSearch.toLowerCase()) || String(c.num).includes(chapterSearch))
    : chapterNames.map((name, i) => ({ name, num: i + 1 }));

  const handleReadChapter = (chapterNum: number) => {
    navigate({
      page: "novel-read",
      novelId,
      novelTitle: novel.title,
      chapterId: `chapter-${chapterNum}`,
      chapterNum,
      chapterTitle: chapterNames[chapterNum - 1] || `Chapter ${chapterNum}`,
      totalChapters,
      novelSource: "novelarchive",
    } as any);
  };

  return (
    <div className="min-h-screen pb-12 bg-black">
      {/* ═══ HERO BANNER ═══ */}
      <div className="relative h-[40vh] min-h-[300px] w-full overflow-hidden bg-black">
        <div className="absolute inset-0">
          {cover && (
            <img src={cover} alt="" className="w-full h-full object-cover scale-110 opacity-25" style={{ filter: "blur(30px)" }} />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/85 to-black/40" />
        </div>

        <button
          onClick={() => navigate({ page: "novel" })}
          className="absolute top-20 left-4 z-10 flex items-center gap-1 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-sm border border-white/[0.08] text-sm text-white/70 hover:bg-black/80 hover:border-white/[0.12] hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 18l-6-6 6-6" /></svg>
          Back
        </button>

        <div className="relative h-full max-w-5xl mx-auto px-4 flex items-end pb-6">
          <div className="flex gap-5 w-full">
            {/* Cover */}
            <div className="shrink-0 w-28 sm:w-40 aspect-[3/4] rounded-xl overflow-hidden shadow-lg shadow-black/50 border-2 border-white/[0.08]">
              {cover ? (
                <img src={cover} alt={novel.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-white/[0.04]">
                  <svg className="w-10 h-10 text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
                  </svg>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 space-y-2">
              <h1
                className="font-karla text-xl sm:text-3xl font-extrabold leading-tight bg-clip-text text-transparent"
                style={{ backgroundImage: "linear-gradient(180deg, #ffffff 0%, #a3a3a3 100%)" }}
              >
                {novel.title}
              </h1>
              <p className="text-sm text-white/40">by {novel.author}</p>

              {/* Stat badges */}
              <div className="flex items-center gap-2 flex-wrap">
                {novel.rating > 0 && (
                  <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/[0.06] border border-white/[0.08] text-xs font-bold text-[#1e88ff]">
                    ★ {novel.rating.toFixed(1)}
                  </span>
                )}
                {totalChapters > 0 && (
                  <span className="px-2.5 py-1 rounded-full bg-white/[0.06] border border-white/[0.08] text-xs font-bold text-white/60">
                    {totalChapters} Chapters
                  </span>
                )}
                {novel.views_number > 0 && (
                  <span className="px-2.5 py-1 rounded-full bg-white/[0.06] border border-white/[0.08] text-xs font-bold text-sky-400">
                    {novel.views_number > 999 ? `${(novel.views_number / 1000).toFixed(1)}k` : novel.views_number} Views
                  </span>
                )}
                {novel.release_status === "ongoing" && (
                  <span className="px-2.5 py-1 rounded-full bg-white/[0.06] border border-white/[0.08] text-xs font-bold text-emerald-400">
                    Ongoing
                  </span>
                )}
              </div>

              {/* Genres */}
              {genres.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {genres.map(g => (
                    <span
                      key={g}
                      className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white/[0.06] border border-white/[0.08] text-white/60"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              )}

              {/* Start Reading */}
              {totalChapters > 0 && (
                <button
                  onClick={() => handleReadChapter(1)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white text-black font-bold text-sm hover:bg-white/90 transition-all hover:scale-105 mt-2"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                  Start Reading
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ DESCRIPTION + CHAPTERS ═══ */}
      <div className="max-w-4xl mx-auto px-4 mt-6 space-y-6">
        {/* Synopsis */}
        {novel.description && (
          <section className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
            <h2 className="text-base font-bold text-white mb-2">Synopsis</h2>
            <p className={`text-sm text-white/60 leading-relaxed whitespace-pre-line ${descExpanded ? "" : "line-clamp-4"}`}>
              {novel.description}
            </p>
            {novel.description.length > 200 && (
              <button onClick={() => setDescExpanded(!descExpanded)} className="text-xs text-[#1e88ff] hover:underline mt-1 font-medium">
                {descExpanded ? "Show Less" : "Read More"}
              </button>
            )}
          </section>
        )}

        {/* Chapter List */}
        <section className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3 gap-3">
            <h2 className="text-base font-bold text-white">
              Chapters <span className="text-white/30 font-normal text-sm">({chapterNames.length})</span>
            </h2>
            <div className="relative flex-1 max-w-xs">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={chapterSearch}
                onChange={e => setChapterSearch(e.target.value)}
                placeholder="Search chapters..."
                className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder:text-white/30 outline-none focus:border-white/30 transition-all"
              />
            </div>
          </div>

          <div className="space-y-0.5 max-h-[500px] overflow-y-auto rounded-xl border border-white/[0.06] bg-black/40 p-2">
            {filteredChapters.length === 0 ? (
              <p className="text-center text-white/30 text-sm py-8">No chapters found</p>
            ) : (
              filteredChapters.slice(0, 200).map(c => (
                <button
                  key={c.num}
                  onClick={() => handleReadChapter(c.num)}
                  className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg hover:bg-white/[0.06] border border-transparent hover:border-white/[0.08] transition-colors text-left group bg-white/[0.02]"
                >
                  <span className="shrink-0 w-8 h-8 rounded-lg bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-[10px] font-bold text-white/60 group-hover:bg-white/[0.1] group-hover:text-white transition-colors">
                    {c.num}
                  </span>
                  <span className="flex-1 text-sm text-white/60 group-hover:text-white transition-colors truncate">
                    {c.name}
                  </span>
                  <svg className="w-3.5 h-3.5 text-white/20 group-hover:text-white/60 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>
              ))
            )}
            {filteredChapters.length > 200 && (
              <p className="text-center text-xs text-white/30 py-3">
                Showing first 200 of {filteredChapters.length} chapters
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
