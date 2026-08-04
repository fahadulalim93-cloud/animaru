"use client";

import { useAppStore } from "./store";

export default function HistoryPage() {
  const { history, navigate } = useAppStore();

  return (
    <div className="min-h-screen w-full bg-[#0a0a0a] text-white fade-in">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">Watch History</h1>
          <p className="text-sm text-white/40 mt-1">{history.length} episodes logged</p>
        </div>

        {history.length > 0 ? (
          <div className="space-y-2">
            {history.map(item => (
              <button
                key={item.id}
                onClick={() => navigate({ page: "watch", id: item.animeId, episode: item.episodeNum, title: item.animeName, image: item.thumbnail })}
                className="w-full flex items-center gap-3 p-3 bg-[#111111] border border-white/[0.06] hover:border-white/[0.12] rounded-xl transition-all text-left group"
              >
                <div className="w-16 h-10 rounded-lg overflow-hidden bg-[#1a1a1a] shrink-0">
                  {item.thumbnail && <img src={item.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white/80 truncate group-hover:text-[#3b82f6] transition-colors">
                    {item.animeName}
                  </p>
                  <p className="text-xs text-white/40">
                    Episode {item.episodeNum} &middot; {Math.round(item.progress)}% complete
                  </p>
                </div>
                <div className="w-20 h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden shrink-0">
                  <div className="h-full bg-[#3b82f6] rounded-full" style={{ width: `${item.progress}%` }} />
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 rounded-2xl bg-[#111111] border border-white/[0.06] p-8">
            <div className="w-16 h-16 rounded-full bg-white/[0.04] flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-white/15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-white/40 text-sm font-medium">No watch history yet</p>
            <p className="text-white/25 text-xs mt-1">Start watching to build your history</p>
            <button
              onClick={() => navigate({ page: "home" })}
              className="mt-4 px-4 py-2 text-xs font-bold bg-[#3b82f6] hover:bg-[#60a5fa] text-white rounded-lg transition-all"
            >
              Browse Anime
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
