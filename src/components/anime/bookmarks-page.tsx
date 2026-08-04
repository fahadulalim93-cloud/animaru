"use client";

import { useAppStore } from "./store";

export default function BookmarksPage() {
  const { bookmarks, navigate } = useAppStore();

  return (
    <div className="min-h-screen w-full bg-[#0a0a0a] text-white fade-in">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">My List</h1>
          <p className="text-sm text-white/40 mt-1">{bookmarks.length} items saved</p>
        </div>

        {bookmarks.length > 0 ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
            {bookmarks.map(bm => (
              <button
                key={bm.id}
                onClick={() => navigate({ page: "anime", id: bm.animeId })}
                className="group text-left"
              >
                <div className="relative aspect-[2/3] overflow-hidden bg-[#111111] rounded-xl border border-white/[0.06] group-hover:border-white/[0.12] transition-colors">
                  {bm.thumbnail && (
                    <img src={bm.thumbnail} alt={bm.animeName} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                  )}
                  {/* Gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  {/* Play overlay */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                    <div className="w-10 h-10 rounded-full bg-white/15 backdrop-blur flex items-center justify-center">
                      <svg className="w-4 h-4 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                    </div>
                  </div>
                  {bm.score && bm.score > 0 && (
                    <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-black/80 backdrop-blur text-[10px] font-bold text-yellow-400">
                      ★ {bm.score}
                    </div>
                  )}
                </div>
                <h3 className="mt-2 text-xs font-medium text-white/70 line-clamp-2 group-hover:text-[#3b82f6] transition-colors">{bm.animeName}</h3>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 rounded-2xl bg-[#111111] border border-white/[0.06] p-8">
            <div className="w-16 h-16 rounded-full bg-white/[0.04] flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-white/15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </div>
            <p className="text-white/40 text-sm font-medium">Your list is empty</p>
            <p className="text-white/25 text-xs mt-1">Start adding anime to your watchlist</p>
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
