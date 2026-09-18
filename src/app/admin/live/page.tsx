"use client";

import React, { useState, useEffect } from "react";
import { Loader2, Radio, Users, Play } from "lucide-react";

interface Watcher {
  username: string;
  animeTitle: string;
  episodeNum: number;
  animeId: string;
  lastSeen: number;
  ago: string;
}

export default function LivePage() {
  const [watchers, setWatchers] = useState<Watcher[]>([]);
  const [loading, setLoading] = useState(true);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const fetchWatchers = async () => {
      try {
        const res = await fetch("/api/analytics/watch-beacon", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setWatchers(data.watchers || []);
          setCount(data.count || 0);
        }
      } catch {} finally {
        setLoading(false);
      }
    };
    fetchWatchers();
    const interval = setInterval(fetchWatchers, 5000); // refresh every 5s
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-wider flex items-center gap-2">
            <Radio className="h-6 w-6 text-red-500 animate-pulse" />
            LIVE WATCHING
          </h1>
          <p className="text-sm text-zinc-500 mt-1">Real-time view of who's watching what right now.</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/30">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-2xl font-bold text-red-500">{count}</span>
          <span className="text-sm text-zinc-400">online</span>
        </div>
      </div>

      {/* Watchers list */}
      {watchers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-600">
          <Users className="h-12 w-12 mb-3 opacity-50" />
          <p className="text-sm">No one is watching right now.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {watchers.map((w, i) => (
            <div
              key={`${w.username}-${i}`}
              className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900/50 border border-white/5 hover:border-white/10 transition-colors"
            >
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500/30 to-blue-500/30 flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-white/80">
                  {w.username === "Guest" ? "G" : w.username[0]?.toUpperCase() || "?"}
                </span>
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-white truncate">{w.username}</span>
                  {w.username !== "Guest" && (
                    <span className="text-[9px] font-bold text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded-full">USER</span>
                  )}
                </div>
                <div className="flex items-center gap-1 text-xs text-zinc-400 mt-0.5">
                  <Play className="w-3 h-3 fill-current shrink-0" />
                  <span className="truncate">{w.animeTitle}</span>
                  <span className="text-zinc-600 shrink-0">· EP {w.episodeNum}</span>
                </div>
              </div>

              {/* Last seen */}
              <div className="text-[10px] text-zinc-600 shrink-0 text-right">
                {w.ago}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Auto-refresh indicator */}
      <div className="flex items-center justify-center gap-2 mt-6 text-xs text-zinc-600">
        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
        Auto-refreshing every 5s
      </div>
    </div>
  );
}
