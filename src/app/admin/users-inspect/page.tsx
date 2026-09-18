"use client";

import React, { useState, useEffect } from "react";
import { UserSearch, Loader2, Eye, Play, Clock, MessageSquare, Bookmark, Trophy } from "lucide-react";

interface UserStats {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  xp: number;
  level: number;
  watchCount: number;
  episodeCount: number;
  commentCount: number;
  bookmarkCount: number;
  watchTimeHours: number;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  animeTracked: number;
  currentlyWatching: {
    animeName: string;
    episode: number;
    episodesWatched: number;
    lastWatchedAt: string;
  } | null;
  recentAnime: Array<{
    name: string;
    episodes: number;
    lastEp: number;
    watchTime: number;
    lastWatched: string;
  }>;
}

export default function DataInspectorPage() {
  const [users, setUsers] = useState<UserStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/user-stats", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setUsers(data.users || []);
        }
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin text-violet-400" /></div>;

  const totalWatchTime = users.reduce((sum, u) => sum + u.watchTimeHours, 0);
  const totalEpisodes = users.reduce((sum, u) => sum + u.episodeCount, 0);
  const totalComments = users.reduce((sum, u) => sum + u.commentCount, 0);
  const totalBookmarks = users.reduce((sum, u) => sum + u.bookmarkCount, 0);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold uppercase tracking-wider">DATA INSPECTOR</h1>
        <p className="text-sm text-zinc-500 mt-1">Per-user engagement: watch count, episodes, hours, comments, bookmarks.</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="p-4 rounded-xl bg-zinc-900/50 border border-white/5">
          <div className="flex items-center gap-2 text-zinc-500 mb-1"><Clock className="w-4 h-4" /><span className="text-xs uppercase">Total Hours</span></div>
          <div className="text-2xl font-bold text-white">{totalWatchTime.toFixed(1)}h</div>
        </div>
        <div className="p-4 rounded-xl bg-zinc-900/50 border border-white/5">
          <div className="flex items-center gap-2 text-zinc-500 mb-1"><Play className="w-4 h-4" /><span className="text-xs uppercase">Episodes</span></div>
          <div className="text-2xl font-bold text-white">{totalEpisodes}</div>
        </div>
        <div className="p-4 rounded-xl bg-zinc-900/50 border border-white/5">
          <div className="flex items-center gap-2 text-zinc-500 mb-1"><MessageSquare className="w-4 h-4" /><span className="text-xs uppercase">Comments</span></div>
          <div className="text-2xl font-bold text-white">{totalComments}</div>
        </div>
        <div className="p-4 rounded-xl bg-zinc-900/50 border border-white/5">
          <div className="flex items-center gap-2 text-zinc-500 mb-1"><Bookmark className="w-4 h-4" /><span className="text-xs uppercase">Bookmarks</span></div>
          <div className="text-2xl font-bold text-white">{totalBookmarks}</div>
        </div>
      </div>

      {/* User list */}
      {users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-600">
          <UserSearch className="h-12 w-12 mb-3 opacity-50" />
          <p className="text-sm">No user data available</p>
        </div>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="rounded-xl bg-zinc-900/50 border border-white/5 overflow-hidden">
              {/* User row — click to expand */}
              <button
                onClick={() => setExpanded(expanded === u.id ? null : u.id)}
                className="w-full flex items-center gap-4 p-4 hover:bg-white/5 transition-colors text-left"
              >
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500/30 to-blue-500/30 flex items-center justify-center shrink-0">
                  {u.avatarUrl ? <img src={u.avatarUrl} className="w-full h-full rounded-full object-cover" alt="" /> : <span className="text-sm font-bold">{u.username[0]?.toUpperCase()}</span>}
                </div>

                {/* Name + status */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{u.displayName}</span>
                    <span className="text-xs text-zinc-500">@{u.username}</span>
                    {u.active ? <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> : <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />}
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    {u.currentlyWatching ? `Watching: ${u.currentlyWatching.animeName} EP ${u.currentlyWatching.episode}` : "Not watching"}
                  </div>
                </div>

                {/* Stats badges */}
                <div className="hidden md:flex items-center gap-3 shrink-0">
                  <div className="text-center">
                    <div className="text-sm font-bold text-white">{u.watchCount}</div>
                    <div className="text-[9px] text-zinc-500 uppercase">Anime</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-bold text-white">{u.episodeCount}</div>
                    <div className="text-[9px] text-zinc-500 uppercase">Eps</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-bold text-white">{u.watchTimeHours}h</div>
                    <div className="text-[9px] text-zinc-500 uppercase">Watched</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-bold text-white">{u.commentCount}</div>
                    <div className="text-[9px] text-zinc-500 uppercase">Comments</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-bold text-white">{u.bookmarkCount}</div>
                    <div className="text-[9px] text-zinc-500 uppercase">Bookmarks</div>
                  </div>
                </div>

                {/* Level + XP */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-center">
                    <div className="text-sm font-bold text-violet-400">Lv.{u.level}</div>
                    <div className="text-[9px] text-zinc-500">{u.xp} XP</div>
                  </div>
                </div>

                {/* Last seen */}
                <div className="text-[10px] text-zinc-600 shrink-0 text-right">
                  {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "Never"}
                </div>
              </button>

              {/* Expanded detail */}
              {expanded === u.id && (
                <div className="border-t border-white/5 p-4 bg-black/30">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Recent anime */}
                    <div>
                      <h4 className="text-xs font-bold text-zinc-400 uppercase mb-2">Recently Watched</h4>
                      {u.recentAnime.length === 0 ? (
                        <p className="text-xs text-zinc-600">No watch history</p>
                      ) : (
                        <div className="space-y-1.5">
                          {u.recentAnime.map((a, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              <Play className="w-3 h-3 text-zinc-600 shrink-0" />
                              <span className="text-zinc-300 truncate flex-1">{a.name}</span>
                              <span className="text-zinc-500 shrink-0">{a.episodes} eps</span>
                              <span className="text-zinc-600 shrink-0">{a.watchTime}min</span>
                              <span className="text-zinc-600 shrink-0">{new Date(a.lastWatched).toLocaleDateString()}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Account info */}
                    <div>
                      <h4 className="text-xs font-bold text-zinc-400 uppercase mb-2">Account</h4>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between"><span className="text-zinc-500">Joined</span><span className="text-zinc-300">{new Date(u.createdAt).toLocaleDateString()}</span></div>
                        <div className="flex justify-between"><span className="text-zinc-500">Last login</span><span className="text-zinc-300">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "Never"}</span></div>
                        <div className="flex justify-between"><span className="text-zinc-500">Anime tracked</span><span className="text-zinc-300">{u.animeTracked}</span></div>
                        <div className="flex justify-between"><span className="text-zinc-500">Status</span><span className={u.active ? "text-green-400" : "text-zinc-600"}>{u.active ? "Active" : "Inactive"}</span></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
