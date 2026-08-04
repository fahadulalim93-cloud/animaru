"use client";

import { useState, useEffect, useMemo } from "react";
import { useAppStore } from "./store";
import { fetchFullAniListCollection, saveAniListEntry, deleteAniListEntry, type AniListFullEntry, type AniListStats } from "@/lib/anilist-auth";
import { RefreshCw, Activity, CalendarCheck, CheckCircle2, Clock, Star, SlidersHorizontal, Trash2, Minus, Plus } from "lucide-react";

const TEXT_GRADIENT = "linear-gradient(180deg, #ffffff 0%, #a3a3a3 100%)";

const STATUS_LABELS: Record<string, string> = {
  CURRENT: "Watching",
  PLANNING: "Planning",
  COMPLETED: "Completed",
  PAUSED: "Paused",
  DROPPED: "Dropped",
  REPEATING: "Rewatching",
};

const TABS = [
  { key: "ALL", label: "All Titles" },
  { key: "CURRENT", label: "Watching" },
  { key: "COMPLETED", label: "Completed" },
  { key: "PLANNING", label: "Planning" },
];

export default function WatchlistPage() {
  const navigate = useAppStore((s) => s.navigate);
  const user = useAppStore((s) => s.user);
  const anilistToken = useAppStore((s) => s.anilistToken);
  const anilistUser = useAppStore((s) => s.anilistUser);
  const openEditListModal = useAppStore((s) => s.openEditListModal);
  const openConnectListModal = useAppStore((s) => s.openConnectListModal);

  const [entries, setEntries] = useState<AniListFullEntry[]>([]);
  const [stats, setStats] = useState<AniListStats>({ count: 0, episodesWatched: 0, minutesWatched: 0 });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("ALL");

  const load = () => {
    if (!anilistToken || !anilistUser) { setLoading(false); return; }
    setLoading(true);
    fetchFullAniListCollection(anilistToken, anilistUser.id)
      .then(({ entries, stats }) => { setEntries(entries); setStats(stats); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, [anilistToken, anilistUser]);

  const counts = useMemo(() => ({
    ALL: entries.length,
    CURRENT: entries.filter((e) => e.status === "CURRENT").length,
    COMPLETED: entries.filter((e) => e.status === "COMPLETED").length,
    PLANNING: entries.filter((e) => e.status === "PLANNING").length,
  }), [entries]);

  const visible = activeTab === "ALL" ? entries : entries.filter((e) => e.status === activeTab);
  const completedCount = counts.COMPLETED;
  const planningCount = counts.PLANNING;

  const adjustProgress = async (entry: AniListFullEntry, delta: number) => {
    if (!anilistToken) return;
    const next = Math.max(0, entry.progress + delta);
    setEntries((prev) => prev.map((e) => (e.entryId === entry.entryId ? { ...e, progress: next } : e)));
    try {
      await saveAniListEntry(anilistToken, {
        mediaId: entry.mediaId, status: entry.status, score: entry.score, progress: next,
        repeat: 0, notes: "", startedAt: "", completedAt: "",
      });
    } catch {
      // revert on failure
      setEntries((prev) => prev.map((e) => (e.entryId === entry.entryId ? { ...e, progress: entry.progress } : e)));
    }
  };

  const removeEntry = async (entry: AniListFullEntry) => {
    if (!anilistToken) return;
    setEntries((prev) => prev.filter((e) => e.entryId !== entry.entryId));
    try {
      await deleteAniListEntry(anilistToken, entry.entryId);
    } catch {
      load();
    }
  };

  return (
    <div className="min-h-screen w-full bg-black text-white">
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="font-karla text-2xl md:text-3xl font-extrabold uppercase tracking-tight bg-clip-text text-transparent" style={{ backgroundImage: TEXT_GRADIENT }}>
            Profile Watchlist
          </h1>
          <p className="text-sm text-white/40 mt-1">Track your personal progress, play duration logs, and ratings.</p>
        </div>
        {anilistToken ? (
          <button onClick={load} className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white/[0.04] border border-white/10 text-xs font-semibold text-white/70 hover:text-white hover:bg-white/[0.08] transition-colors">
            <RefreshCw size={14} />
            Synced with AniList
          </button>
        ) : (
          <button onClick={openConnectListModal} className="px-3.5 py-2 rounded-lg bg-white text-black text-xs font-semibold hover:bg-white/90 transition-colors">
            Connect AniList
          </button>
        )}
      </div>

      {/* Info + stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full overflow-hidden shrink-0" style={{ backgroundColor: (user?.avatarColor || "#7c3aed") + "44" }}>
              {user?.avatarImage ? (
                <img src={user.avatarImage} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-sm font-bold" style={{ color: user?.avatarColor || "#7c3aed" }}>
                  {(user?.avatar || user?.username?.charAt(0) || "?").toUpperCase()}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">{user?.username || "Guest"}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30">User</p>
            </div>
          </div>
          <div className="h-px bg-white/10 my-3" />
          <div className="space-y-1.5">
            {user?.tagline && (
              <p className="text-xs text-white/60 flex items-center gap-1.5">🏅 {user.tagline}</p>
            )}
            {user?.favorites && user.favorites.length > 0 && (
              <p className="text-xs text-white/60 flex items-center gap-1.5">♡ Fav Genres: {user.favorites.slice(0, 2).join(" / ")}</p>
            )}
          </div>
          {anilistUser && (
            <span className="inline-block mt-3 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider text-indigo-300 border border-indigo-400/30 bg-indigo-500/10">
              AniList Connected
            </span>
          )}
        </div>

        <StatCard icon={<Activity size={16} />} iconBg="bg-violet-500/15 text-violet-300" label="Watch Duration" title="Total Hours" value={Math.round(stats.minutesWatched / 60)} />
        <StatCard icon={<CalendarCheck size={16} />} iconBg="bg-sky-500/15 text-sky-300" label="Watched Epis" title="Episodes" value={stats.episodesWatched} />
        <StatCard icon={<CheckCircle2 size={16} />} iconBg="bg-emerald-500/15 text-emerald-300" label="Completed Titles" title="Completed" value={completedCount} />
        <StatCard icon={<Clock size={16} />} iconBg="bg-amber-500/15 text-amber-300" label="Saved Later" title="Planning" value={planningCount} />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-white/10 mb-4 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`shrink-0 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              activeTab === t.key ? "text-white border-white" : "text-white/40 border-transparent hover:text-white/70"
            }`}
          >
            {t.label} <span className="text-white/30">({counts[t.key as keyof typeof counts]})</span>
          </button>
        ))}
      </div>

      {/* List */}
      {!anilistToken ? (
        <div className="py-16 text-center text-white/40 text-sm">Connect AniList to see your synced watchlist.</div>
      ) : loading ? (
        <div className="py-16 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-white/10 border-t-white rounded-full animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <div className="py-16 text-center text-white/40 text-sm">Nothing here yet.</div>
      ) : (
        <div className="space-y-2">
          {visible.map((entry) => (
            <div key={entry.entryId} className="flex items-center gap-4 p-3 rounded-xl border border-white/10 bg-white/[0.02]">
              <button onClick={() => navigate({ page: "anime", id: String(entry.mediaId) })} className="w-12 h-16 rounded-lg overflow-hidden shrink-0 bg-white/5">
                {entry.cover && <img src={entry.cover} alt="" className="w-full h-full object-cover" />}
              </button>
              <div className="min-w-0 flex-1">
                <button onClick={() => navigate({ page: "anime", id: String(entry.mediaId) })} className="text-sm font-semibold text-white hover:underline text-left line-clamp-1">
                  {entry.title}
                </button>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-white/10 text-white/60">{STATUS_LABELS[entry.status] || entry.status}</span>
                  {entry.format && <span className="text-[10px] text-white/30">· {entry.format}</span>}
                </div>
              </div>

              <div className="hidden sm:block shrink-0 w-32">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30 mb-1">Progress</p>
                <div className="flex items-center gap-2">
                  <button onClick={() => adjustProgress(entry, -1)} className="w-6 h-6 rounded bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors">
                    <Minus size={12} />
                  </button>
                  <span className="text-xs font-bold text-white w-12 text-center">{entry.progress} / {entry.episodes ?? "?"}</span>
                  <button onClick={() => adjustProgress(entry, 1)} className="w-6 h-6 rounded bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors">
                    <Plus size={12} />
                  </button>
                </div>
                {entry.episodes ? (
                  <div className="h-[3px] rounded-full bg-white/10 mt-1.5 overflow-hidden">
                    <div className="h-full bg-white/60" style={{ width: `${Math.min(100, (entry.progress / entry.episodes) * 100)}%` }} />
                  </div>
                ) : (
                  <div className="h-[3px] rounded-full bg-white/10 mt-1.5" />
                )}
              </div>

              <div className="hidden sm:block shrink-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30 mb-1">Your Score</p>
                <span className="text-xs font-bold text-amber-400 flex items-center gap-1"><Star size={12} fill="currentColor" /> {entry.score > 0 ? entry.score.toFixed(1) : "–"}</span>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => openEditListModal({ id: entry.mediaId, title: entry.title, cover: entry.cover })}
                  title="Edit"
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <SlidersHorizontal size={14} />
                </button>
                <button
                  onClick={() => removeEntry(entry)}
                  title="Remove"
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
    </div>
  );
}

function StatCard({ icon, iconBg, label, title, value }: { icon: React.ReactNode; iconBg: string; label: string; title: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 flex flex-col justify-between">
      <div className="flex items-center justify-between mb-6">
        <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">{title}</p>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconBg}`}>{icon}</div>
      </div>
      <div>
        <p className="text-2xl font-extrabold text-white">{value}</p>
        <p className="text-[10px] text-white/30 mt-0.5">{label}</p>
      </div>
    </div>
  );
}
