"use client";

import { useMemo, useState } from "react";
import { useAppStore, type HistoryItem } from "./store";
import { frameSrcOf } from "./avatar-frames";

const FONT = "var(--font-poppins), system-ui, sans-serif";

// An episode counts as "completed" once 90% of its runtime was watched — same
// threshold the profile page uses to classify watch status.
const COMPLETE_RATIO = 0.9;
const isCompleted = (h: HistoryItem) =>
  (h.duration || 0) > 0 && (h.progress || 0) / (h.duration || 1) >= COMPLETE_RATIO;

interface Watcher {
  id: string;
  username: string;
  name: string;
  avatarEmoji?: string;
  avatarColor?: string;
  avatarImage?: string;
  avatarFrame?: string;
  xp: number;
  level: number;
  episodes: number;
  completed: number;
  comments: number;
  isCurrentUser: boolean;
}

const initial = (w: { avatarEmoji?: string; name?: string; username: string }) =>
  (w.avatarEmoji || (w.name || w.username).charAt(0) || "?").toUpperCase();

// Other accounts registered in this browser. Their watch activity isn't shared
// (it lives in each browser's own store), so they rank at 0 XP.
function readOtherWatchers(excludeId?: string): Watcher[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem("luffytv_users");
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((u): u is Record<string, string> => !!u && typeof u === "object")
      .filter((u) => u.id !== excludeId)
      .map((u) => ({
        id: String(u.id),
        username: String(u.username || "user"),
        name: String(u.name || u.username || "User"),
        avatarEmoji: u.avatarEmoji,
        avatarColor: u.accentColor || u.avatarColor,
        avatarImage: u.avatarImage,
        avatarFrame: u.avatarFrame,
        xp: 0,
        level: 1,
        episodes: 0,
        completed: 0,
        comments: 0,
        isCurrentUser: false,
      }));
  } catch {
    return [];
  }
}

/** Avatar bubble with the equipped decorative PNG frame overlaid. */
function Avatar({ w, size }: { w: Watcher; size: number }) {
  const color = w.avatarColor || "#7c3aed";
  const frame = frameSrcOf(w.avatarFrame);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="w-full h-full rounded-full flex items-center justify-center font-black overflow-hidden transition-shadow"
        style={{ background: `${color}33`, color, fontSize: size * 0.4 }}
      >
        {w.avatarImage ? (
          <img src={w.avatarImage} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
        ) : (
          initial(w)
        )}
      </div>
      {frame && (
        <img
          src={frame}
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[128%] h-[128%] max-w-none"
        />
      )}
    </div>
  );
}

export default function LeaderboardPage() {
  const navigate = useAppStore((s) => s.navigate);
  const user = useAppStore((s) => s.user);
  const history = useAppStore((s) => s.history);
  const activity = useAppStore((s) => s.activity);

  const [others] = useState<Watcher[]>(() => readOtherWatchers(user?.id));
  const [query, setQuery] = useState("");

  // The current user's real stats, computed the same way the profile does.
  const me = useMemo<Watcher | null>(() => {
    if (!user) return null;
    const latest = new Map<string, HistoryItem>();
    for (const h of history) {
      const prev = latest.get(h.animeId);
      if (!prev || new Date(h.updatedAt).getTime() > new Date(prev.updatedAt).getTime()) latest.set(h.animeId, h);
    }
    const titles = [...latest.values()];
    const completed = titles.filter(isCompleted).length;
    const episodes = history.length;
    const activityXP = activity.reduce((s, a) => s + (a.xp || 0), 0);
    const xp = episodes * 10 + activityXP;
    return {
      id: user.id,
      username: user.username,
      name: user.name || user.username,
      avatarEmoji: user.avatarEmoji,
      avatarColor: user.accentColor || user.avatarColor,
      avatarImage: user.avatarImage,
      avatarFrame: user.avatarFrame,
      xp,
      level: Math.floor(xp / 1000) + 1,
      episodes,
      completed,
      comments: 0,
      isCurrentUser: true,
    };
  }, [user, history, activity]);

  const ranked = useMemo(() => {
    const all = me ? [me, ...others] : others;
    return [...all]
      .sort((a, b) => b.xp - a.xp || a.name.localeCompare(b.name))
      .map((w, i) => ({ ...w, rank: i + 1 }));
  }, [me, others]);

  const myRank = ranked.find((w) => w.isCurrentUser)?.rank;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ranked;
    return ranked.filter((w) => w.name.toLowerCase().includes(q) || w.username.toLowerCase().includes(q));
  }, [ranked, query]);

  const podium = ranked.slice(0, 3);
  const rest = filtered.filter((w) => w.rank > 3);
  const accent = user?.accentColor || "#a855f7";

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-24 text-center">
        <h1 className="text-2xl font-black" style={{ fontFamily: FONT }}>Leaderboard</h1>
        <p className="text-white/50 mt-3">Sign in to see where you rank.</p>
      </div>
    );
  }

  // Podium is laid out 2nd · 1st · 3rd, with 1st raised.
  const podiumOrder = [podium[1], podium[0], podium[2]].filter(Boolean) as (Watcher & { rank: number })[];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* ── Hero ── */}
      <div className="rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] to-transparent p-6 sm:p-8 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-yellow-400/80 mb-2">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm0 2h14v2H5v-2z" /></svg>
              Community Ranking
            </span>
            <h1 className="text-3xl sm:text-4xl font-black" style={{ fontFamily: FONT }}>Top watchers this season</h1>
            <p className="text-white/45 text-sm mt-2 max-w-md">Ranked by total XP earned across the platform — earned by watching and completing anime.</p>
          </div>
          <div className="flex gap-3">
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Total watchers</p>
              <p className="text-2xl font-black tabular-nums">{ranked.length.toLocaleString()}</p>
            </div>
            <div className="rounded-2xl border px-5 py-3 text-center" style={{ borderColor: `${accent}44`, background: `${accent}12` }}>
              <p className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Your rank</p>
              <p className="text-2xl font-black tabular-nums" style={{ color: accent }}>{myRank ? `#${myRank}` : "—"}</p>
            </div>
          </div>
        </div>
        <div className="mt-5 relative">
          <svg className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" strokeLinecap="round" /></svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search any user by name…"
            className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] pl-10 pr-4 py-2.5 text-sm outline-none focus:border-white/20 transition-colors"
          />
        </div>
      </div>

      {/* ── Podium (only when not searching) ── */}
      {!query && podiumOrder.length > 0 && (
        <div className="flex items-end justify-center gap-3 sm:gap-5 mb-8">
          {podiumOrder.map((w) => {
            const first = w.rank === 1;
            const medal = w.rank === 1 ? "🥇" : w.rank === 2 ? "🥈" : "🥉";
            return (
              <button
                key={w.id}
                onClick={() => w.isCurrentUser && navigate({ page: "profile" })}
                className={`flex-1 max-w-[190px] rounded-3xl border p-4 flex flex-col items-center text-center transition-transform ${first ? "-translate-y-4" : ""} ${w.isCurrentUser ? "hover:scale-[1.02]" : "cursor-default"}`}
                style={{ borderColor: first ? `${accent}66` : "rgba(255,255,255,0.08)", background: first ? `${accent}10` : "rgba(255,255,255,0.02)" }}
              >
                <span className="text-[11px] font-bold text-white/50 mb-2">{medal} #{w.rank}</span>
                <Avatar w={w} size={first ? 84 : 64} />
                <p className="mt-3 font-bold text-sm truncate max-w-full">{w.name}{w.isCurrentUser && <span className="text-white/40 font-normal"> (You)</span>}</p>
                <p className="text-[10px] uppercase tracking-wider text-white/40 mt-0.5">Level {w.level}</p>
                <div className="mt-3 rounded-xl px-4 py-2 w-full" style={{ background: first ? `${accent}22` : "rgba(255,255,255,0.04)" }}>
                  <p className="text-lg font-black tabular-nums" style={{ color: first ? accent : "#fff" }}>{w.xp.toLocaleString()}</p>
                  <p className="text-[9px] uppercase tracking-wider text-white/40">XP</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Ranked rows ── */}
      <div className="space-y-2">
        {rest.map((w) => {
          const nextTier = (Math.floor(w.xp / 1000) + 1) * 1000;
          const pct = Math.min(100, ((w.xp % 1000) / 1000) * 100);
          return (
            <div
              key={w.id}
              className="flex items-center gap-3 sm:gap-4 rounded-2xl border p-3 sm:p-4"
              style={{ borderColor: w.isCurrentUser ? `${accent}55` : "rgba(255,255,255,0.07)", background: w.isCurrentUser ? `${accent}0f` : "rgba(255,255,255,0.02)" }}
            >
              <div className="w-8 text-center shrink-0">
                <p className="text-lg font-black tabular-nums text-white/60">{w.rank}</p>
                <p className="text-[8px] uppercase tracking-wider text-white/30">Rank</p>
              </div>
              <Avatar w={w} size={44} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-sm truncate">{w.name}{w.isCurrentUser && <span className="text-white/40 font-normal"> (You)</span>}</p>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md shrink-0" style={{ background: `${accent}22`, color: accent }}>Lv. {w.level}</span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: accent }} />
                </div>
                <p className="text-[10px] text-white/35 mt-1 tabular-nums">{w.xp.toLocaleString()} / {nextTier.toLocaleString()} XP</p>
              </div>
              <div className="hidden sm:flex items-center gap-2 shrink-0">
                {[
                  { label: "Episodes", value: w.episodes },
                  { label: "Completed", value: w.completed },
                  { label: "Comments", value: w.comments },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-center min-w-[58px]">
                    <p className="text-sm font-black tabular-nums">{s.value}</p>
                    <p className="text-[8px] uppercase tracking-wider text-white/35">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {rest.length === 0 && (
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] py-12 text-center text-white/40 text-sm">
            {query ? "No watchers match your search." : "No other watchers yet — invite friends to sign up and climb the ranks."}
          </div>
        )}
      </div>
    </div>
  );
}
