"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppStore, type HistoryItem } from "./store";
import { getAniListAuthUrl, isAniListConfigured } from "@/lib/anilist-auth";
import { updateUserProfile, changePassword, getMyRole } from "@/lib/auth-local";
import { useCountUp } from "@/hooks/use-count-up";
import { FRAMES, frameSrcOf } from "./avatar-frames";
import AvatarPickerModal from "./avatar-picker-modal";
import { useSubtitleSettings, FONT_OPTIONS } from "./subtitle-settings";

/**
 * ProfilePage — unified account hub (cinematic redesign).
 *
 * Compact cinematic header, glassmorphism stat cards,
 * anime-styled pill tabs, tight sidebar-appropriate spacing.
 *
 * Five sections:
 *   Overview   — greeting + level bar, stat cards, watch time,
 *                status breakdown, activity heatmap + streaks, recently
 *                updated / highest rated, connected trackers.
 *   Library    — every history + library entry as a poster grid.
 *   Achievements — tiered achievement system with XP tracking.
 *   Activity   — heatmap, recent episodes, achievements.
 *   Settings   — Account / General / Player / Appearance / About.
 *
 * Arriving via #settings opens the Settings tab. Everything is wired to the
 * real store (history, activity, library, bookmarks, user, anilist, prefs).
 */

const FONT = "var(--font-space-grotesk), 'Space Grotesk', sans-serif";

const GENRES = ["Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror", "Isekai", "Mecha", "Mystery", "Psychological", "Romance", "Sci-Fi", "Slice of Life", "Sports", "Supernatural", "Thriller"];
const AVATAR_COLORS = ["#a855f7", "#7c3aed", "#FF6B00", "#FFB800", "#22c55e", "#3b82f6", "#ec4899", "#f59e0b", "#10b981", "#ef4444", "#06b6d4", "#84cc16"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ── Theme presets (accent + preview gradient) ──
const THEMES: { key: string; name: string; accent: string; bg: string; dot2?: string }[] = [
  { key: "default", name: "Default", accent: "#ffffff", bg: "linear-gradient(135deg,#111,#0a0a0a)" },
  { key: "midnight", name: "Midnight", accent: "#48A6FF", bg: "linear-gradient(135deg,#0b1a33,#050a14)" },
  { key: "crimson", name: "Crimson", accent: "#ef4444", bg: "linear-gradient(135deg,#2a0d0d,#120505)", dot2: "#f87171" },
  { key: "emerald", name: "Emerald", accent: "#10B981", bg: "linear-gradient(135deg,#06231a,#04120d)", dot2: "#34d399" },
  { key: "amoled", name: "AMOLED", accent: "#a1a1aa", bg: "linear-gradient(135deg,#000,#000)" },
  { key: "sunset", name: "Sunset", accent: "#F59E0B", bg: "linear-gradient(135deg,#331d06,#1a0f03)", dot2: "#fbbf24" },
  { key: "rose", name: "Rose", accent: "#F472B6", bg: "linear-gradient(135deg,#2a0f22,#140510)", dot2: "#fb7185" },
  { key: "amber", name: "Amber", accent: "#eab308", bg: "linear-gradient(135deg,#2a2206,#141003)", dot2: "#fde047" },
  { key: "galaxy", name: "Galaxy", accent: "#a855f7", bg: "linear-gradient(135deg,#1e1033,#0c0518)", dot2: "#c084fc" },
  { key: "ocean", name: "Ocean", accent: "#22D3EE", bg: "linear-gradient(135deg,#062a33,#03151a)", dot2: "#67e8f9" },
  { key: "sakura", name: "Sakura", accent: "#f9a8d4", bg: "linear-gradient(135deg,#2a1420,#140810)", dot2: "#f472b6" },
];


function dateKeyOf(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function streaksFromKeys(keys: Set<string>): { current: number; best: number } {
  if (keys.size === 0) return { current: 0, best: 0 };
  const days = [...keys].map((k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d).getTime(); }).sort((a, b) => a - b);
  const DAY = 86400000;
  let best = 1, run = 1;
  for (let i = 1; i < days.length; i++) {
    if (days[i] - days[i - 1] === DAY) { run++; best = Math.max(best, run); } else run = 1;
  }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const t = today.getTime();
  const set = new Set(days);
  let current = 0;
  if (set.has(t) || set.has(t - DAY)) {
    let cur = set.has(t) ? t : t - DAY;
    while (set.has(cur)) { current++; cur -= DAY; }
  }
  return { current, best };
}
function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function Icon({ path, size = 18 }: { path: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>;
}

const ICONS = {
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 3",
  layers: "M12 3 2 8l10 5 10-5-10-5zM2 16l10 5 10-5M2 12l10 5 10-5",
  play: "M8 5v14l11-7L8 5z",
  film: "M4 4h16v16H4V4zM4 9h16M4 15h16M9 4v16M15 4v16",
  flame: "M12 2s4 4 4 8a4 4 0 0 1-8 0c0-1 .5-2 .5-2S8 10 8 12a4 4 0 0 0 8 0c0-4-4-10-4-10z",
  trophy: "M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3",
  chat: "M21 11.5a8.5 8.5 0 0 1-8.5 8.5H12l-5 2 1-4.5A8.5 8.5 0 1 1 21 11.5z",
  star: "M12 2l3 6.5 7 .9-5 4.8 1.2 7L12 18l-6.4 3.2L6.8 14l-5-4.8 7-.9z",
  bolt: "M13 2 4 14h6l-1 8 9-12h-6l1-8z",
  check: "M20 6 9 17l-5-5",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  shield: "M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5l-8-3z",
  share: "M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v14",
  user: "M20 21a8 8 0 1 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  sliders: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
  palette: "M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.2 0-.9.7-1.5 1.5-1.5H16a4 4 0 0 0 4-4c0-4.4-3.6-8-8-8z",
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
};

function BigStat({ value, suffix, label }: { value: number; suffix?: string; label: string }) {
  const [go, setGo] = useState(false);
  useEffect(() => { const t = requestAnimationFrame(() => setGo(true)); return () => cancelAnimationFrame(t); }, []);
  const n = useCountUp(value, 1400, go);
  return (
    <div>
      <p className="font-black text-2xl sm:text-3xl tabular-nums" style={{ fontFamily: FONT }}>{n.toLocaleString()}{suffix || ""}</p>
      <p className="text-white/40 text-[10px] sm:text-xs uppercase tracking-wide mt-0.5">{label}</p>
    </div>
  );
}

/* ── Glass Card — cinematic glassmorphism matching site theme ── */
function Card({ title, right, children, className = "" }: { title?: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-white/[0.07] hover:border-white/[0.13] backdrop-blur-sm p-4 sm:p-5 transition-colors duration-200 ${className}`}
      // A soft top-down sheen instead of one flat fill — gives the panels some
      // depth so a long settings column doesn't read as one grey slab.
      style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.022) 100%)" }}
    >
      {(title || right) && (
        <div className="flex items-center justify-between mb-3">
          {title && <h3 className="font-bold text-sm" style={{ fontFamily: FONT }}>{title}</h3>}
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

/** Panel heading — title plus a one-line explanation of what the group does.
 *  The settings panels previously opened with a bare <h2>, which gave no sense
 *  of what each section covered. */
function SectionHead({ title, desc, accent }: { title: string; desc?: string; accent: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-1 w-1 h-8 rounded-full shrink-0" style={{ background: accent, boxShadow: `0 0 12px ${accent}66` }} />
      <div className="min-w-0">
        <h2 className="font-black text-lg leading-tight" style={{ fontFamily: FONT }}>{title}</h2>
        {desc && <p className="text-white/40 text-xs mt-0.5">{desc}</p>}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="py-8 text-center text-white/35 text-xs">{text}</div>;
}

function Toggle({ on, onClick, accent }: { on: boolean; onClick: () => void; accent: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className="relative w-[46px] h-[26px] rounded-full shrink-0 transition-all duration-300 border"
      style={{
        background: on ? accent : "rgba(255,255,255,0.10)",
        borderColor: on ? accent : "rgba(255,255,255,0.14)",
        // Lit ring when on, so an enabled setting is obvious at a glance down a
        // long column of rows.
        boxShadow: on ? `0 0 0 3px ${accent}22, 0 0 14px ${accent}55` : "none",
      }}
    >
      <span
        className="absolute top-[3px] left-[3px] w-[18px] h-[18px] rounded-full bg-white"
        style={{
          // Slight overshoot on the knob — reads as physical rather than a
          // linear slide.
          transition: "transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1)",
          transform: on ? "translateX(20px)" : "none",
          boxShadow: "0 1px 4px rgba(0,0,0,0.45)",
        }}
      />
    </button>
  );
}

function Row({ title, desc, children, icon, accent }: { title: string; desc?: string; children: React.ReactNode; icon?: string; accent?: string }) {
  return (
    <div className="group flex items-center justify-between gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.055] hover:border-white/[0.13] backdrop-blur-sm px-4 sm:px-5 py-3.5 transition-all duration-200">
      <div className="flex items-center gap-3 min-w-0">
        {icon && (
          <span
            className="w-9 h-9 rounded-xl shrink-0 grid place-items-center transition-colors"
            style={{ background: `${accent || "#ffffff"}1a`, color: accent || "#fff" }}
          >
            <Icon path={icon} size={16} />
          </span>
        )}
        <div className="min-w-0">
          <p className="font-bold text-sm">{title}</p>
          {desc && <p className="text-white/45 text-xs leading-relaxed mt-0.5">{desc}</p>}
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange, accent }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; accent: string }) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-white/10 bg-black/40 p-1">
      {options.map((o) => {
        const active = value === o.v;
        return (
          <button
            key={o.v}
            onClick={() => onChange(o.v)}
            className="px-3.5 py-1.5 rounded-full text-xs font-bold transition-all duration-200"
            style={active
              ? { background: accent, color: "#05060a", boxShadow: `0 2px 10px ${accent}55` }
              : { color: "rgba(255,255,255,0.55)" }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const TABS = ["Overview", "Library", "Achievements", "Activity", "Settings"] as const;
type Tab = (typeof TABS)[number];
const TAB_ICON: Record<Tab, string> = { Overview: ICONS.layers, Library: ICONS.film, Achievements: ICONS.trophy, Activity: ICONS.flame, Settings: ICONS.gear };

const TIERS: Record<string, { label: string; c: string }> = {
  bronze: { label: "Bronze", c: "#cd7f32" },
  silver: { label: "Silver", c: "#cbd5e1" },
  gold: { label: "Gold", c: "#f5b301" },
  platinum: { label: "Platinum", c: "#22d3ee" },
  diamond: { label: "Diamond", c: "#a855f7" },
};

type WatchStatus = "Watching" | "Completed" | "Planning" | "Paused" | "Dropped";
const STATUS_META: { id: WatchStatus; c: string }[] = [
  { id: "Watching", c: "#48A6FF" },
  { id: "Completed", c: "#34D399" },
  { id: "Planning", c: "#a855f7" },
  { id: "Paused", c: "#eab308" },
  { id: "Dropped", c: "#ef4444" },
];
// ── Watch-status evaluation (from real progress + recency) ──
const COMPLETE_RATIO = 0.9;
const PAUSE_DAYS = 1;
const DROP_DAYS = 3;
function classifyByProgress(progress: number, duration: number, updatedAt: string): WatchStatus {
  const ratio = duration > 0 ? progress / duration : 0;
  if (ratio >= COMPLETE_RATIO) return "Completed";
  const daysIdle = (Date.now() - new Date(updatedAt).getTime()) / 86400000;
  if (daysIdle >= DROP_DAYS) return "Dropped";
  if (daysIdle >= PAUSE_DAYS) return "Paused";
  return "Watching";
}

const SETTINGS_TABS = [
  { id: "account", label: "Account", icon: ICONS.user },
  { id: "general", label: "General", icon: ICONS.sliders },
  { id: "player", label: "Player", icon: ICONS.play },
  { id: "subtitles", label: "Subtitles", icon: ICONS.chat },
  { id: "keyboard", label: "Keyboard", icon: ICONS.bolt },
  { id: "appearance", label: "Appearance", icon: ICONS.palette },
  { id: "about", label: "About", icon: ICONS.info },
] as const;

/**
 * Donation link. Leave empty until there's a real destination — the card still
 * renders, but the button stays inert rather than sending anyone to a dead URL.
 * Drop the URL in here (Ko-fi, Patreon, PayPal, …) and it becomes a live link.
 */
const DONATE_URL = "";

/** Support card shown above the settings sub-nav. */
function DonateCard() {
  const label = DONATE_URL ? "Donate" : "Coming soon";
  const inner = (
    <>
      <span className="text-[#ec4899]">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 21s-6.7-4.35-9.33-8.05C.4 9.9 1.6 6.1 4.9 5.2c2-.55 3.9.3 5.1 1.85l2 2.6 2-2.6c1.2-1.55 3.1-2.4 5.1-1.85 3.3.9 4.5 4.7 2.23 7.75C18.7 16.65 12 21 12 21z" />
        </svg>
      </span>
      {label}
    </>
  );

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-5 mb-4"
      style={{ background: "linear-gradient(135deg, #f9407f 0%, #ec4899 45%, #c026d3 100%)" }}
    >
      {/* Dot texture, purely decorative */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-[0.18]"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)",
          backgroundSize: "14px 14px",
        }}
      />
      <div className="relative">
        <h3 className="font-black text-lg text-white leading-tight" style={{ fontFamily: FONT }}>
          Support LuffyTV
        </h3>
        <p className="text-white/85 text-[13px] leading-relaxed mt-2">
          LuffyTV is free with no ads and no paywalls. If you like what we do, you can help keep it running.
        </p>

        {DONATE_URL ? (
          <a
            href={DONATE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-white text-[#08080c] font-bold text-[15px] py-3 hover:bg-white/90 transition-colors"
          >
            {inner}
          </a>
        ) : (
          <button
            type="button"
            disabled
            title="Donation link not set yet"
            className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-white/90 text-[#08080c] font-bold text-[15px] py-3 cursor-default opacity-80"
          >
            {inner}
          </button>
        )}
      </div>
    </div>
  );
}

/** Player keyboard shortcuts, surfaced so they're discoverable outside the
 *  player's own help overlay. */
const KEY_SHORTCUTS: { keys: string[]; action: string }[] = [
  { keys: ["Space", "K"], action: "Play / pause" },
  { keys: ["F"], action: "Toggle fullscreen" },
  { keys: ["M"], action: "Mute / unmute" },
  { keys: ["←", "→"], action: "Seek backward / forward" },
  { keys: ["↑", "↓"], action: "Volume up / down" },
  { keys: ["N"], action: "Next episode" },
  { keys: ["P"], action: "Previous episode" },
  { keys: ["C"], action: "Toggle subtitles" },
  { keys: ["S"], action: "Skip intro / outro" },
  { keys: ["Ctrl", "S"], action: "Focus search" },
  { keys: ["Esc"], action: "Exit fullscreen / close panel" },
];

/** Compact labelled slider used by the Subtitles panel. */
function SettingSlider({ label, value, min, max, step = 1, unit = "", onChange, accent }: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string;
  onChange: (v: number) => void; accent: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-bold text-white/70">{label}</span>
        <span className="text-xs font-bold tabular-nums" style={{ color: accent }}>{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
        style={{ accentColor: accent, background: "rgba(255,255,255,0.10)" }}
      />
    </div>
  );
}
type SettingsTab = (typeof SETTINGS_TABS)[number]["id"];

export default function ProfilePage() {
  const navigate = useAppStore((s) => s.navigate);
  const route = useAppStore((s) => s.route);
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);
  const logout = useAppStore((s) => s.logout);
  const openAuthModal = useAppStore((s) => s.openAuthModal);
  const history = useAppStore((s) => s.history);
  const bookmarks = useAppStore((s) => s.bookmarks);
  const library = useAppStore((s) => s.library);
  const activity = useAppStore((s) => s.activity);
  const anilistUser = useAppStore((s) => s.anilistUser);
  const clearAnilistAuth = useAppStore((s) => s.clearAnilistAuth);
  const prefs = useAppStore((s) => s.prefs);
  const setPref = useAppStore((s) => s.setPref);
  const mediaProgress = useAppStore((s) => s.mediaProgress);
  const setHistory = useAppStore((s) => s.setHistory);
  const setBookmarks = useAppStore((s) => s.setBookmarks);

  const [tab, setTab] = useState<Tab>(route.page === "settings" ? "Settings" : "Overview");
  const [range, setRange] = useState<"week" | "month" | "year">("year");
  const [copied, setCopied] = useState(false);
  const [bannerImg, setBannerImg] = useState<string | null>(null);
  const [libFilter, setLibFilter] = useState<"all" | WatchStatus>("all");
  const [libSearch, setLibSearch] = useState("");
  const [libShuffle, setLibShuffle] = useState(0);
  const [showPicker, setShowPicker] = useState(false);
  const [isMod, setIsMod] = useState(false);

  // Settings sub-state
  const [sTab, setSTab] = useState<SettingsTab>("account");
  // Same store the player writes to, so changes here apply to playback
  // immediately — these aren't a separate copy of the settings.
  const { settings: subs, update: updateSubs, reset: resetSubs } = useSubtitleSettings();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [bio, setBio] = useState("");
  const [emoji, setEmoji] = useState("");
  const [tagline, setTagline] = useState("");
  const [favs, setFavs] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwMsg, setPwMsg] = useState("");

  // Keep the tab in sync if the route flips to #settings while mounted.
  useEffect(() => { if (route.page === "settings") setTab("Settings"); }, [route.page]);

  // Show the "Mod Tools" entry point if the site owner promoted this account.
  useEffect(() => {
    if (!user) return;
    getMyRole(user.username).then((r) => setIsMod(r === "mod"));
  }, [user]);

  // Only redirect once the persisted store has actually rehydrated.
  useEffect(() => {
    const check = () => { if (!useAppStore.getState().user) { openAuthModal("signin", "Sign in to view your profile"); navigate({ page: "home" }); } };
    const unsub = useAppStore.persist.onFinishHydration(check);
    if (useAppStore.persist.hasHydrated()) check();
    return unsub;
  }, [navigate, openAuthModal]);

  // Pull a fresh random anime banner from AniList on every mount.
  useEffect(() => {
    if (user?.bannerImage) return;
    let cancelled = false;
    fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query: "query{Page(perPage:50){media(sort:TRENDING_DESC,type:ANIME,isAdult:false){bannerImage}}}" }),
    })
      .then((r) => r.json())
      .then((d) => {
        const list: string[] = (d?.data?.Page?.media || []).map((m: { bannerImage?: string }) => m.bannerImage).filter(Boolean);
        if (list.length && !cancelled) setBannerImg(list[Math.floor(Math.random() * list.length)]);
      })
      .catch(() => { /* offline / blocked — keep the gradient banner */ });
    return () => { cancelled = true; };
  }, []);

  // Hydrate the account form from the user.
  useEffect(() => {
    if (!user) return;
    setName(user.name || "");
    setEmail(user.email || "");
    setBio(user.bio || "");
    setEmoji(user.avatarEmoji || "");
    setTagline(user.tagline || "");
    setFavs(user.favorites || []);
  }, [user]);

  const accent = user?.accentColor || "#a855f7";

  // ── Aggregate history to ONE entry per anime ──
  const animeTitles = useMemo(() => {
    const latest = new Map<string, HistoryItem>();
    for (const h of history) {
      const prev = latest.get(h.animeId);
      if (!prev || new Date(h.updatedAt).getTime() > new Date(prev.updatedAt).getTime()) latest.set(h.animeId, h);
    }
    return [...latest.values()].map((h) => ({ h, status: classifyByProgress(h.progress || 0, h.duration || 0, h.updatedAt) }));
  }, [history]);

  // ── Derived stats (all real) ──
  const stats = useMemo(() => {
    const episodes = history.length;
    const playedIds = new Set(animeTitles.map((t) => t.h.animeId));
    const planningBookmarks = bookmarks.filter((b) => !playedIds.has(b.animeId)).length;
    const entries = animeTitles.length + library.length + planningBookmarks;
    const minutes = Math.round(history.reduce((s, h) => {
      const dur = h.duration || 0;
      const prog = h.progress || 0;
      const secs = dur > 0 ? Math.min(prog, dur) : prog;
      return s + secs / 60;
    }, 0));
    const hours = +(minutes / 60).toFixed(1);
    const activityXP = activity.reduce((s, a) => s + (a.xp || 0), 0);
    const totalXP = episodes * 10 + activityXP;
    const level = Math.floor(totalXP / 1000) + 1;
    const xpInLevel = totalXP % 1000;
    const pct = (xpInLevel / 1000) * 100;
    const completed = animeTitles.filter((t) => t.status === "Completed").length;
    const inProgress = animeTitles.filter((t) => t.status === "Watching").length;
    const scored = [...bookmarks.filter((b) => b.score), ...library.filter((l) => l.score)].map((x: { score?: number }) => x.score || 0);
    const meanScore = scored.length ? +(scored.reduce((a, b) => a + b, 0) / scored.length).toFixed(1) : 0;
    return { episodes, entries, minutes, hours, totalXP, level, xpInLevel, pct, completed, inProgress, meanScore, scored };
  }, [history, animeTitles, library, activity, bookmarks]);

  // ── Every tracked title, tagged with a watch status ──
  const libItems = useMemo(() => {
    const out: { id: string; status: WatchStatus; title: string; cover?: string; meta: string; go: () => void; edit: () => void }[] = [];
    const played = new Set<string>();
    for (const { h, status } of animeTitles) {
      out.push({ id: "h_" + h.animeId, status, title: h.animeName, cover: h.thumbnail, meta: `Episode ${h.episodeNum}`, go: () => navigate({ page: "watch", id: h.animeId, episode: h.episodeNum, title: h.animeName, image: h.thumbnail }), edit: () => navigate({ page: "anime", id: h.animeId }) });
      played.add(h.animeId);
    }
    for (const b of bookmarks) {
      if (played.has(b.animeId)) continue;
      out.push({ id: "b_" + b.id, status: "Planning", title: b.animeName, cover: b.thumbnail, meta: b.type || "Planning", go: () => navigate({ page: "anime", id: b.animeId }), edit: () => navigate({ page: "anime", id: b.animeId }) });
    }
    for (const l of library) {
      out.push({ id: "l_" + l.key, status: "Planning", title: l.title, cover: l.cover, meta: l.meta || l.kind, go: () => navigate(l.resume), edit: () => navigate(l.resume) });
    }
    return out;
  }, [animeTitles, bookmarks, library, navigate]);

  const statusCounts = useMemo(() => {
    const m: Record<WatchStatus, number> = { Watching: 0, Completed: 0, Planning: 0, Paused: 0, Dropped: 0 };
    for (const it of libItems) m[it.status]++;
    return m;
  }, [libItems]);
  const statusTotal = libItems.length;

  const dayCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const h of history) { const k = dateKeyOf(new Date(h.updatedAt).getTime()); m.set(k, (m.get(k) || 0) + 1); }
    for (const a of activity) { const k = dateKeyOf(a.ts); m.set(k, (m.get(k) || 0) + 1); }
    return m;
  }, [history, activity]);
  const streaks = useMemo(() => streaksFromKeys(new Set(dayCounts.keys())), [dayCounts]);
  const activeDays = dayCounts.size;
  const dailyAvg = activeDays ? +(stats.episodes / activeDays).toFixed(1) : 0;

  const heatmap = useMemo(() => {
    const days = range === "week" ? 7 : range === "month" ? 35 : 182;
    const cells: { key: string; count: number }[] = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400000);
      const k = dateKeyOf(d.getTime());
      cells.push({ key: k, count: dayCounts.get(k) || 0 });
    }
    return cells;
  }, [range, dayCounts]);
  const maxCount = Math.max(1, ...heatmap.map((c) => c.count));

  const recently = useMemo(() =>
    [...history].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 5),
    [history]);
  const highestRated = useMemo(() =>
    [...bookmarks.filter((b) => b.score), ...library.filter((l) => l.score).map((l) => ({ animeName: l.title, thumbnail: l.cover, score: l.score }))]
      .sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 5),
    [bookmarks, library]);

  const topGenres = user?.favorites || [];

  // ── Continue Watching ──
  const continueWatching = useMemo(() => {
    const fromHistory = [...history]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 12)
      .map((h) => ({ id: "h_" + h.id, title: h.animeName, cover: h.thumbnail, sub: `Episode ${h.episodeNum}`, pct: 0, go: () => navigate({ page: "watch", id: h.animeId, episode: h.episodeNum, title: h.animeName, image: h.thumbnail }) }));
    const fromMedia = [...mediaProgress]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 12)
      .map((p) => ({ id: "m_" + p.key, title: p.title, cover: p.cover, sub: p.unitLabel, pct: Math.max(0, Math.min(100, p.percent || 0)), go: () => navigate(p.resume) }));
    return [...fromMedia, ...fromHistory].slice(0, 12);
  }, [history, mediaProgress, navigate]);

  // ── Weekday activity distribution ──
  const weekdayCounts = useMemo(() => {
    const arr = [0, 0, 0, 0, 0, 0, 0];
    for (const h of history) arr[new Date(h.updatedAt).getDay()]++;
    for (const a of activity) arr[new Date(a.ts).getDay()]++;
    return arr;
  }, [history, activity]);
  const weekdayMax = Math.max(1, ...weekdayCounts);

  // ── Extra signals for achievements ──
  const extra = useMemo(() => {
    let nightOwl = false;
    for (const h of history) { if (new Date(h.updatedAt).getHours() < 5) { nightOwl = true; break; } }
    if (!nightOwl) for (const a of activity) { if (new Date(a.ts).getHours() < 5) { nightOwl = true; break; } }
    const daysSinceJoin = user?.createdAt ? Math.floor((Date.now() - new Date(user.createdAt).getTime()) / 86400000) : 0;
    const weekendActive = (weekdayCounts[0] + weekdayCounts[6]) > 0 && (weekdayCounts[0] >= weekdayMax || weekdayCounts[6] >= weekdayMax);
    return { nightOwl, daysSinceJoin, weekendActive };
  }, [history, activity, user, weekdayCounts, weekdayMax]);

  if (!user) return null;

  const avatarChar = (user.avatarEmoji || user.avatar || user.username?.charAt(0) || "?").toUpperCase();
  const joined = user.createdAt ? new Date(user.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "";
  const bannerGradient = `radial-gradient(ellipse at 20% 0%, ${accent}55, transparent 55%), radial-gradient(ellipse at 80% 30%, ${accent}25, transparent 60%), linear-gradient(180deg, #12121a 0%, #08080c 100%)`;

  const heatColor = (c: number) => {
    if (c === 0) return "rgba(255,255,255,0.05)";
    const t = Math.min(1, 0.3 + (c / maxCount) * 0.7);
    return `${accent}${Math.round(t * 255).toString(16).padStart(2, "0")}`;
  };

  const share = () => {
    navigator.clipboard?.writeText(`${window.location.origin}/#profile`).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }).catch(() => {});
  };

  const dirty = name !== (user.name || "") || email !== (user.email || "") || bio !== (user.bio || "")
    || emoji !== (user.avatarEmoji || "") || tagline !== (user.tagline || "") || JSON.stringify(favs) !== JSON.stringify(user.favorites || []);
  const saveAccount = () => {
    updateUserProfile(user.id, { name, bio, avatarEmoji: emoji, tagline, favorites: favs });
    setUser({ ...user, name, bio, email, avatarEmoji: emoji, tagline, favorites: favs });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };
  const setAvatarColor = (c: string) => {
    updateUserProfile(user.id, { accentColor: c, avatarColor: c });
    setUser({ ...user, accentColor: c, avatarColor: c });
  };
  const setFrame = (key: string) => {
    updateUserProfile(user.id, { avatarFrame: key });
    setUser({ ...user, avatarFrame: key });
  };
  const frameSrc = frameSrcOf(user.avatarFrame);
  const toggleFav = (g: string) => setFavs((f) => f.includes(g) ? f.filter((x) => x !== g) : [...f, g]);
  const exportData = () => {
    const blob = new Blob([JSON.stringify({ user: { username: user.username, name: user.name }, history, bookmarks, library, activity }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "luffytv-data.json"; a.click();
    URL.revokeObjectURL(url);
  };
  const clearHistory = () => { if (confirm("Clear your entire watch history? This cannot be undone.")) setHistory([]); };
  const clearAllData = () => { if (confirm("Clear ALL data — history and bookmarks? This cannot be undone.")) { setHistory([]); setBookmarks([]); } };
  const doChangePw = () => {
    const res = changePassword(user.id, oldPw, newPw);
    if (res.ok) { setPwMsg("Password updated."); setOldPw(""); setNewPw(""); setTimeout(() => { setShowPw(false); setPwMsg(""); }, 1400); }
    else setPwMsg(res.error);
  };
  const pickTheme = (key: string, themeAccent: string) => {
    setPref("theme", key);
    if (themeAccent !== "#ffffff") {
      updateUserProfile(user.id, { accentColor: themeAccent });
      setUser({ ...user, accentColor: themeAccent });
    }
  };

  return (
    <div className="w-full text-white min-h-screen" style={{ fontFamily: FONT }}>

      {/* ═══ COMPACT CINEMATIC HEADER ═══ */}
      <div className="relative w-full" style={{ height: "clamp(180px, 14rem, 280px)" }}>
        {/* Banner image or gradient */}
        <div className="absolute inset-0 transition-opacity duration-700" style={(user.bannerImage || bannerImg) ? { backgroundImage: `url("${user.bannerImage || bannerImg}")`, backgroundSize: "cover", backgroundPosition: "center top" } : { background: bannerGradient }} />
        {/* Cinematic gradient overlay — fades to site bg */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(8,8,12,0.1) 0%, rgba(8,8,12,0.45) 50%, rgba(8,8,12,0.85) 80%, #08080c 100%)" }} />
        {/* Accent glow line at bottom */}
        <div className="absolute bottom-0 inset-x-0 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)" }} />
        {/* Vignette — pulls the eye off the banner edges and onto the profile
            block, so a busy key-art banner doesn't fight the name for attention. */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 30% 100%, transparent 25%, rgba(8,8,12,0.55) 100%)" }} />

        {/* Profile info — left-aligned, compact layout */}
        <div className="absolute inset-x-0 bottom-0">
          {/* Same full-width alignment as the content below, so the avatar and
              name line up with the cards instead of sitting inset from them. */}
          <div className="w-full px-3 sm:px-4 lg:px-4 pb-4 flex items-center gap-4 sm:gap-5">
            {/* Avatar — compact size matching sidebar feel */}
            <div className="relative shrink-0 w-[72px] h-[72px] sm:w-[88px] sm:h-[88px]">
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[78%] h-[78%] z-[1]">
                <div className="w-full h-full rounded-full flex items-center justify-center text-2xl sm:text-3xl font-black shadow-lg overflow-hidden transition-shadow" style={{ background: "rgba(255,255,255,0.14)", color: "#fff", boxShadow: "0 0 20px rgba(255,255,255,0.12)" }}>
                  {user.avatarImage ? <img src={user.avatarImage} alt="" className="w-full h-full object-cover" loading="eager" /> : avatarChar}
                </div>
              </div>
              {frameSrc && <img src={frameSrc} alt="" aria-hidden loading="lazy" decoding="async" className="pointer-events-none absolute inset-0 w-full h-full max-w-none select-none z-[2]" />}
            </div>
            <div className="flex-1 min-w-0">
              <h1
                className="font-black text-xl sm:text-2xl lg:text-3xl leading-none"
                style={{ fontFamily: FONT, textShadow: "0 2px 18px rgba(0,0,0,0.85)" }}
              >
                {user.name || user.username}
              </h1>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 text-xs sm:text-sm text-white/55">
                <span className="rounded-full bg-black/40 backdrop-blur-sm border border-white/[0.08] px-2.5 py-1 font-medium">@{user.username}</span>
                {joined && (
                  <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-black/40 backdrop-blur-sm border border-white/[0.08] px-2.5 py-1 text-white/45">
                    <Icon path={ICONS.clock} size={11} /> Joined {joined}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 font-black px-2.5 py-1 rounded-full text-[11px] border border-white/20 bg-white/10 text-white">
                  <Icon path={ICONS.bolt} size={10} /> Lv.{stats.level}
                </span>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={share} className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.1] bg-black/30 backdrop-blur-sm px-3 py-2 text-xs font-bold hover:bg-white/10 transition-colors">
                <Icon path={ICONS.share} size={14} /> {copied ? "Copied!" : "Share"}
              </button>
              {isMod && (
                <button onClick={() => navigate({ page: "mod" })} className="inline-flex items-center gap-1.5 rounded-md border border-sky-400/30 bg-sky-500/10 text-sky-400 px-3 py-2 text-xs font-bold hover:bg-sky-500/20 transition-colors">
                  <Icon path={ICONS.shield} size={14} /> Mod
                </button>
              )}
              <button onClick={() => setTab("Settings")} className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-bold transition-colors bg-white hover:bg-white/90 text-[#08080c]">
                <Icon path={ICONS.gear} size={14} /> Settings
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ CONTENT ═══ */}
      {/* Full width, flush to the left. This was `max-w-6xl mx-auto`, which
          centred the column and left a dead gap between the app sidebar and
          the profile content on wide screens. */}
      <div className="w-full px-3 sm:px-4 lg:px-4 pb-16">

        {/* ── Level + stats — single full-width band across the top ── */}
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm px-4 sm:px-5 py-4 mt-3 flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6">

          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <div className="flex items-baseline gap-2 min-w-0">
                <span className="text-[10px] font-black tracking-[0.14em] uppercase text-white/40">Level</span>
                <span className="font-black text-2xl leading-none text-white tabular-nums" style={{ fontFamily: FONT }}>
                  {stats.level}
                </span>
              </div>
              <span className="text-[11px] font-bold text-white/45 tabular-nums shrink-0">
                {stats.totalXP.toLocaleString()} XP
              </span>
            </div>

            <div className="h-2 rounded-full bg-white/[0.07] overflow-hidden">
              <div
                className="h-full rounded-full bg-white transition-all duration-700"
                style={{ width: `${Math.max(stats.pct, 2)}%` }}
              />
            </div>

            <p className="text-[10px] text-white/40 mt-1.5 tabular-nums">
              <span className="font-bold text-white/70">{Math.round(stats.pct)}%</span>
              {" · "}{1000 - stats.xpInLevel} XP to next level
            </p>
          </div>

          <div className="grid grid-cols-4 gap-2 shrink-0">
            {[
              { l: "Entries", v: stats.entries, icon: ICONS.layers },
              { l: "Episodes", v: stats.episodes, icon: ICONS.play },
              { l: "Hours", v: stats.hours, icon: ICONS.clock },
              { l: "Mean", v: stats.meanScore ? `${stats.meanScore}` : "—", icon: ICONS.star },
            ].map((s) => (
              <div
                key={s.l}
                className="rounded-xl border border-white/[0.07] hover:border-white/[0.18] bg-black/25 px-2 py-2.5 text-center min-w-[68px] transition-colors duration-200"
              >
                <span className="grid place-items-center mx-auto mb-1 w-6 h-6 rounded-lg bg-white/[0.08] text-white/70">
                  <Icon path={s.icon} size={12} />
                </span>
                <p className="font-black text-base leading-none tabular-nums text-white" style={{ fontFamily: FONT }}>{s.v}</p>
                <p className="text-[9px] uppercase tracking-wider text-white/40 font-bold mt-1">{s.l}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ═══ PRIMARY TABS — segmented pill bar ═══
             A 2px underline on a dark page was easy to lose; the active tab is
             now a filled pill sitting in its own track. */}
        <div className="flex items-center gap-1 mt-4 p-1 rounded-2xl border border-white/[0.07] bg-black/30 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {TABS.map((t) => {
            const active = tab === t;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-bold whitespace-nowrap rounded-xl transition-all duration-200 shrink-0"
                style={active
                  // Monochrome: the active tab is a white tile with dark text,
                  // which reads harder than any tint at this size.
                  ? { background: "#ededed", color: "#08080c" }
                  : { color: "rgba(255,255,255,0.45)" }}
              >
                <span><Icon path={TAB_ICON[t]} size={14} /></span>
                <span className="hidden sm:inline">{t}</span>
              </button>
            );
          })}
        </div>

        {/* ═══ OVERVIEW ═══ */}
        {tab === "Overview" && (
          <div className="mt-4 space-y-3">
            {/* Continue Watching */}
            {continueWatching.length > 0 && (
              <Card title="Continue Watching" right={<button onClick={() => setTab("Library")} className="text-xs font-bold transition-colors hover:opacity-80" style={{ color: accent }}>View all</button>}>
                <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: "thin" }}>
                  {continueWatching.map((c) => (
                    <button key={c.id} onClick={c.go} className="group shrink-0 w-[100px] sm:w-[110px] text-left">
                      <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-white/5">
                        {c.cover && <img src={c.cover} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />}
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                          <span className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: accent, color: "#08080c" }}><Icon path={ICONS.play} size={14} /></span>
                        </div>
                        {c.pct > 0 && <div className="absolute bottom-0 inset-x-0 h-[3px] bg-black/50"><div className="h-full rounded-full" style={{ width: `${c.pct}%`, background: accent }} /></div>}
                      </div>
                      <p className="text-xs font-semibold truncate mt-1">{c.title}</p>
                      <p className="text-white/40 text-[10px]">{c.sub}</p>
                    </button>
                  ))}
                </div>
              </Card>
            )}

            <div className="grid lg:grid-cols-[1.2fr_1fr] gap-3">
              <Card title="Watch Time">
                <p className="font-black text-3xl sm:text-4xl tabular-nums" style={{ fontFamily: FONT }}>{stats.hours}<span className="text-lg text-white/40 ml-1">hours</span></p>
                <p className="text-white/45 text-xs mt-1">{stats.episodes} episodes across {stats.entries} entries</p>
                <div className="grid grid-cols-3 gap-2 mt-4">
                  {[
                    { l: "Mean Score", v: stats.meanScore ? `${stats.meanScore}` : "—", s: "/10" },
                    { l: "Completed", v: `${stats.completed}` },
                    { l: "In Progress", v: `${stats.inProgress}` },
                  ].map((x) => (
                    <div key={x.l} className="rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-2.5">
                      <p className="font-black text-lg" style={{ fontFamily: FONT }}>{x.v}<span className="text-[10px] text-white/35">{x.s || ""}</span></p>
                      <p className="text-white/40 text-[9px] uppercase tracking-wide mt-0.5">{x.l}</p>
                    </div>
                  ))}
                </div>
              </Card>

              <Card title="Status Breakdown" right={<span className="text-xs text-white/40">{statusTotal} total</span>}>
                {statusTotal === 0 ? <Empty text="No entries yet" /> : (
                  <div className="pt-1">
                    {/* stacked bar */}
                    <div className="flex h-[6px] rounded-full overflow-hidden bg-white/[0.06] mb-3">
                      {STATUS_META.map((s) => statusCounts[s.id] > 0 && (
                        <div key={s.id} style={{ width: `${(statusCounts[s.id] / statusTotal) * 100}%`, background: s.c }} />
                      ))}
                    </div>
                    <div className="space-y-2">
                      {STATUS_META.map((s) => {
                        const v = statusCounts[s.id];
                        const p = Math.round((v / statusTotal) * 100);
                        return (
                          <div key={s.id} className="flex items-center gap-2.5 text-sm">
                            <span className="w-[6px] h-[6px] rounded-full shrink-0" style={{ background: s.c }} />
                            <span className="font-semibold flex-1">{s.id}</span>
                            <span className="text-white/40 text-[10px] tabular-nums w-8 text-right">{p}%</span>
                            <span className="font-bold tabular-nums w-5 text-right text-xs" style={{ color: s.c }}>{v}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </Card>
            </div>

            <Card
              title="Activity History"
              right={
                <div className="flex items-center gap-1 rounded-full border border-white/10 bg-black/30 p-0.5">
                  {(["week", "month", "year"] as const).map((r) => (
                    <button key={r} onClick={() => setRange(r)} className="px-2 py-0.5 rounded-full text-[10px] font-bold capitalize transition-colors" style={range === r ? { background: accent, color: "#08080c" } : { color: "rgba(255,255,255,0.5)" }}>{r}</button>
                  ))}
                </div>
              }
            >
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                {[
                  { icon: ICONS.layers, l: "Episodes", v: `${stats.episodes}`, c: accent },
                  { icon: ICONS.clock, l: "Daily Avg", v: `${dailyAvg}`, c: "#48A6FF" },
                  { icon: ICONS.flame, l: "Current Streak", v: `${streaks.current}`, c: "#F59E0B" },
                  { icon: ICONS.trophy, l: "Best Streak", v: `${streaks.best}`, c: "#34D399" },
                ].map((x) => (
                  <div key={x.l} className="rounded-lg border border-white/[0.06] bg-black/20 p-2.5">
                    <div className="w-6 h-6 rounded-md flex items-center justify-center mb-1.5" style={{ background: `${x.c}15`, color: x.c }}><Icon path={x.icon} size={13} /></div>
                    <p className="font-black text-base tabular-nums" style={{ fontFamily: FONT }}>{x.v}</p>
                    <p className="text-white/40 text-[9px] uppercase tracking-wide">{x.l}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-[3px]">
                {heatmap.map((c) => (
                  <div key={c.key} title={`${c.key}: ${c.count}`} className="w-[10px] h-[10px] rounded-[2px]" style={{ background: heatColor(c.count) }} />
                ))}
              </div>
            </Card>

            {/* Stat cards row — glassmorphism with accent glow */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { icon: ICONS.play, l: "Episodes Watched", v: stats.episodes, c: accent },
                { icon: ICONS.check, l: "Anime Completed", v: stats.completed, c: "#34D399" },
                { icon: ICONS.chat, l: "Comments Posted", v: 0, c: "#F472B6" },
                { icon: ICONS.bolt, l: "Total XP", v: stats.totalXP, c: "#F59E0B" },
              ].map((x) => (
                <div key={x.l} className="rounded-xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm p-4" style={{ boxShadow: `0 0 24px ${x.c}08` }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2.5" style={{ background: `${x.c}15`, color: x.c }}><Icon path={x.icon} size={16} /></div>
                  <BigStat value={x.v} label={x.l} />
                </div>
              ))}
            </div>

            <div className="grid lg:grid-cols-2 gap-3">
              <Card title="Recently Updated">
                {recently.length === 0 ? <Empty text="No recent updates yet." /> : (
                  <div className="space-y-1.5">
                    {recently.map((h) => (
                      <button key={h.id} onClick={() => navigate({ page: "watch", id: h.animeId, episode: h.episodeNum, title: h.animeName, image: h.thumbnail })} className="w-full flex items-center gap-2.5 rounded-lg hover:bg-white/[0.04] p-1 text-left transition-colors">
                        <div className="w-8 h-10 rounded overflow-hidden bg-white/5 shrink-0">{h.thumbnail && <img src={h.thumbnail} alt="" className="w-full h-full object-cover" />}</div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold truncate">{h.animeName}</p>
                          <p className="text-white/40 text-[11px]">Episode {h.episodeNum}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </Card>
              <Card title="Highest Rated">
                {highestRated.length === 0 ? <Empty text="Rate some shows to see your top picks here." /> : (
                  <div className="space-y-1.5">
                    {highestRated.map((h, i) => (
                      <div key={i} className="flex items-center gap-2.5 p-1">
                        <div className="w-8 h-10 rounded overflow-hidden bg-white/5 shrink-0">{h.thumbnail && <img src={h.thumbnail} alt="" className="w-full h-full object-cover" />}</div>
                        <p className="text-sm font-semibold truncate flex-1">{h.animeName}</p>
                        <span className="text-xs font-bold flex items-center gap-1" style={{ color: "#F59E0B" }}><Icon path={ICONS.star} size={11} /> {h.score}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            <div className="grid lg:grid-cols-2 gap-3">
              <Card title="Top Genres" right={<span className="text-xs text-white/40">{topGenres.length} tracked</span>}>
                {topGenres.length === 0 ? <Empty text="Not enough data yet — start adding shows to your library." /> : (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {topGenres.map((g) => <span key={g} className="text-xs font-semibold rounded-md px-2.5 py-1" style={{ background: `${accent}15`, color: accent }}>{g}</span>)}
                  </div>
                )}
              </Card>
              <Card title="Connected Trackers">
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between rounded-lg border border-white/[0.07] bg-black/20 px-3 py-2.5">
                    <div className="flex items-center gap-2"><div className="w-7 h-7 rounded-md flex items-center justify-center font-black text-[9px]" style={{ background: "#02a9ff18", color: "#02a9ff" }}>AL</div><div><p className="text-sm font-bold">AniList</p><p className="text-white/40 text-[11px]">{anilistUser ? `Synced · ${anilistUser.name}` : "Not connected"}</p></div></div>
                    {anilistUser ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "#34D39918", color: "#34D399" }}>LINKED</span>
                      : isAniListConfigured() ? <a href={getAniListAuthUrl()} className="text-[11px] font-bold rounded px-2.5 py-1" style={{ background: accent, color: "#08080c" }}>Connect</a>
                      : <button onClick={() => setTab("Settings")} className="text-[11px] font-bold text-white/50">Settings</button>}
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-white/[0.07] bg-black/20 px-3 py-2.5">
                    <div className="flex items-center gap-2"><div className="w-7 h-7 rounded-md flex items-center justify-center font-black text-[9px]" style={{ background: "#2e51a218", color: "#5f7fc9" }}>MAL</div><div><p className="text-sm font-bold">MyAnimeList</p><p className="text-white/40 text-[11px]">Not connected</p></div></div>
                    <span className="text-[11px] text-white/35">Soon</span>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* ═══ LIBRARY ═══ */}
        {tab === "Library" && (() => {
          const q = libSearch.trim().toLowerCase();
          let shown = libItems.filter((it) =>
            (libFilter === "all" || it.status === libFilter) &&
            (!q || it.title.toLowerCase().includes(q))
          );
          if (libShuffle) { const a = [...shown]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(((libShuffle * 9301 + i * 49297) % 233280) / 233280 * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } shown = a; }
          const chips: { id: "all" | WatchStatus; label: string; c: string; n: number }[] = [
            { id: "all", label: "All", c: "#ffffff", n: libItems.length },
            ...STATUS_META.map((s) => ({ id: s.id, label: s.id, c: s.c, n: statusCounts[s.id] })),
          ];
          const pickRandom = () => { if (shown.length) shown[Math.floor(Math.random() * shown.length)].go(); };
          return (
            <div className="mt-4">
              {libItems.length === 0 ? <Empty text="Your library is empty — start watching or add titles to see them here." /> : (
                <>
                  {/* search + actions */}
                  <div className="flex flex-col sm:flex-row gap-2 mb-3">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35"><Icon path="M21 21l-4.3-4.3M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z" size={15} /></span>
                      <input value={libSearch} onChange={(e) => setLibSearch(e.target.value)} placeholder="Search your library..." className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] pl-9 pr-3 py-2 text-sm outline-none focus:border-white/25 transition-colors" />
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setLibShuffle((n) => n + 1)} className="inline-flex items-center gap-1 rounded-lg border border-white/[0.1] px-3 py-2 text-xs font-bold hover:bg-white/5 transition-colors"><Icon path="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" size={13} /> Shuffle</button>
                      <button onClick={pickRandom} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold transition-colors" style={{ background: accent, color: "#08080c" }}><Icon path={ICONS.play} size={13} /> Random</button>
                    </div>
                  </div>
                  {/* status chips */}
                  <div className="flex items-center gap-1.5 flex-wrap mb-3">
                    {chips.map((f) => {
                      const on = libFilter === f.id;
                      return (
                        <button key={f.id} onClick={() => setLibFilter(f.id)} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide transition-colors border" style={on ? { background: "rgba(255,255,255,0.08)", color: "#fff", borderColor: "rgba(255,255,255,0.15)" } : { background: "transparent", color: "rgba(255,255,255,0.5)", borderColor: "rgba(255,255,255,0.08)" }}>
                          <span className="w-[5px] h-[5px] rounded-full" style={{ background: f.c }} /> {f.label} <span className="opacity-50">{f.n}</span>
                        </button>
                      );
                    })}
                  </div>
                  {shown.length === 0 ? <Empty text="Nothing matches — try another filter or search." /> : (
                    <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-2.5">
                      {shown.map((it) => {
                        const sc = STATUS_META.find((s) => s.id === it.status)?.c || accent;
                        return (
                          <div key={it.id} className="group relative">
                            <button onClick={it.go} className="text-left w-full">
                              <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-white/5 mb-1">
                                {it.cover && <img src={it.cover} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />}
                                <span className="absolute bottom-1 left-1 w-[6px] h-[6px] rounded-full ring-1 ring-black/50" style={{ background: sc }} title={it.status} />
                              </div>
                              <p className="text-xs font-semibold truncate">{it.title}</p>
                              <p className="text-white/40 text-[10px] capitalize">{it.meta}</p>
                            </button>
                            <button onClick={it.edit} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 backdrop-blur flex items-center justify-center text-white/80 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80" title="Open"><Icon path="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" size={11} /></button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })()}

        {/* ═══ ACHIEVEMENTS ═══ */}
        {tab === "Achievements" && (() => {
          const B = "bronze", S = "silver", G = "gold", P = "platinum", D = "diamond";
          const cats = [
            { key: "watching", label: "Watching", icon: ICONS.play, c: "#F472B6", items: [
              { n: "Freshly Isekai'd", d: "Watch 10 episodes", t: B, xp: 10, cur: stats.episodes, target: 10 },
              { n: "Training Arc", d: "Watch 50 episodes", t: S, xp: 25, cur: stats.episodes, target: 50 },
              { n: "Binge Protagonist", d: "Watch 150 episodes", t: G, xp: 50, cur: stats.episodes, target: 150 },
              { n: "Marathon Sensei", d: "Watch 500 episodes", t: P, xp: 100, cur: stats.episodes, target: 500 },
              { n: "Ascended Otaku", d: "Watch 1,500 episodes", t: D, xp: 200, cur: stats.episodes, target: 1500 },
            ] },
            { key: "completing", label: "Completing", icon: ICONS.check, c: "#34D399", items: [
              { n: "Roll the Credits", d: "Complete 1 anime", t: B, xp: 10, cur: stats.completed, target: 1 },
              { n: "Series Slayer", d: "Complete 10 anime", t: S, xp: 25, cur: stats.completed, target: 10 },
              { n: "Arc Finisher", d: "Complete 50 anime", t: G, xp: 50, cur: stats.completed, target: 50 },
              { n: "Grand Completionist", d: "Complete 200 anime", t: P, xp: 100, cur: stats.completed, target: 200 },
              { n: "Living Anime Database", d: "Complete 500 anime", t: D, xp: 200, cur: stats.completed, target: 500 },
            ] },
            { key: "streaks", label: "Streaks", icon: ICONS.flame, c: "#F59E0B", items: [
              { n: "Warming Up", d: "Hit a 3-day streak", t: B, xp: 10, cur: streaks.best, target: 3 },
              { n: "Committed", d: "Hit a 7-day streak", t: S, xp: 25, cur: streaks.best, target: 7 },
              { n: "Unbreakable", d: "Hit a 30-day streak", t: G, xp: 50, cur: streaks.best, target: 30 },
              { n: "No Life Detected", d: "Hit a 100-day streak", t: D, xp: 200, cur: streaks.best, target: 100 },
            ] },
            { key: "collection", label: "Collection", icon: ICONS.layers, c: "#48A6FF", items: [
              { n: "Hoarder Begins", d: "Save 5 titles", t: B, xp: 10, cur: stats.entries, target: 5 },
              { n: "Shelf Stacker", d: "Save 25 titles", t: S, xp: 25, cur: stats.entries, target: 25 },
              { n: "The Curator", d: "Save 100 titles", t: G, xp: 50, cur: stats.entries, target: 100 },
            ] },
            { key: "critic", label: "Critic", icon: ICONS.star, c: "#eab308", items: [
              { n: "First Verdict", d: "Rate 1 title", t: B, xp: 10, cur: stats.scored.length, target: 1 },
              { n: "Opinionated", d: "Rate 10 titles", t: S, xp: 25, cur: stats.scored.length, target: 10 },
              { n: "Certified Critic", d: "Rate 50 titles", t: G, xp: 50, cur: stats.scored.length, target: 50 },
            ] },
            { key: "prestige", label: "Prestige", icon: ICONS.bolt, c: "#a855f7", items: [
              { n: "Level Up", d: "Reach Level 2", t: B, xp: 10, cur: stats.level, target: 2 },
              { n: "Seasoned", d: "Reach Level 5", t: S, xp: 25, cur: stats.level, target: 5 },
              { n: "Veteran", d: "Reach Level 10", t: G, xp: 50, cur: stats.level, target: 10 },
              { n: "XP Machine", d: "Earn 5,000 XP", t: P, xp: 100, cur: stats.totalXP, target: 5000 },
            ] },
            { key: "legendary", label: "Legendary", icon: ICONS.trophy, c: "#22D3EE", items: [
              { n: "Night Owl", d: "Watch something after midnight", t: S, xp: 25, cur: extra.nightOwl ? 1 : 0, target: 1 },
              { n: "Weekend Warrior", d: "Be most active on a weekend", t: S, xp: 25, cur: extra.weekendActive ? 1 : 0, target: 1 },
              { n: "Genre Explorer", d: "Pick 5+ favorite genres", t: B, xp: 10, cur: (user.favorites || []).length, target: 5 },
              { n: "Made It Yours", d: "Set a custom emoji or tagline", t: B, xp: 10, cur: (user.avatarEmoji || user.tagline) ? 1 : 0, target: 1 },
              { n: "Loyal Fan", d: "Be a member for 30 days", t: G, xp: 50, cur: extra.daysSinceJoin, target: 30 },
              { n: "Perfectionist", d: "Complete everything you track", t: P, xp: 100, cur: (stats.entries > 0 && stats.completed >= stats.entries) ? 1 : 0, target: 1 },
            ] },
          ];
          const all = cats.flatMap((c) => c.items);
          const done = all.filter((a) => a.cur >= a.target).length;
          const totalXP = all.filter((a) => a.cur >= a.target).reduce((s, a) => s + a.xp, 0);
          const pct = Math.round((done / all.length) * 100);
          return (
            <div className="mt-4 space-y-4">
              {/* header */}
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm p-4 flex items-center gap-3" style={{ boxShadow: `0 0 24px ${accent}08` }}>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${accent}15`, color: accent }}><Icon path={ICONS.trophy} size={20} /></div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-black text-base" style={{ fontFamily: FONT }}>Achievements</h3>
                  <p className="text-white/45 text-[11px]">{done} of {all.length} unlocked · {totalXP.toLocaleString()} XP earned</p>
                  <div className="h-[6px] rounded-full bg-white/[0.06] overflow-hidden mt-1.5 max-w-xs"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${accent}, ${accent}aa)` }} /></div>
                </div>
                <p className="font-black text-xl sm:text-2xl tabular-nums shrink-0" style={{ fontFamily: FONT }}>{pct}%</p>
              </div>

              {cats.map((cat) => (
                <div key={cat.key}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="w-4 h-4 flex items-center justify-center" style={{ color: cat.c }}><Icon path={cat.icon} size={14} /></span>
                    <h4 className="text-[11px] font-black uppercase tracking-widest" style={{ color: cat.c }}>{cat.label}</h4>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    {cat.items.map((a) => {
                      const unlocked = a.cur >= a.target;
                      const p = Math.min(100, Math.round((a.cur / a.target) * 100));
                      const tier = TIERS[a.t];
                      return (
                        <div key={a.n} className="rounded-xl border p-3" style={{ borderColor: unlocked ? `${tier.c}40` : "rgba(255,255,255,0.07)", background: unlocked ? `${tier.c}08` : "rgba(255,255,255,0.02)" }}>
                          <div className="flex items-start gap-2">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: unlocked ? `${tier.c}18` : "rgba(255,255,255,0.04)", color: unlocked ? tier.c : "rgba(255,255,255,0.3)" }}>
                              <Icon path={unlocked ? cat.icon : "M12 15v2m-6 4h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2zM8 11V7a4 4 0 0 1 8 0v4"} size={16} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-bold text-sm truncate" style={{ color: unlocked ? "#fff" : "rgba(255,255,255,0.65)" }}>{a.n}</p>
                              <p className="text-white/40 text-[11px] leading-snug">{a.d}</p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between mt-2 mb-1">
                            <span className="text-[8px] font-black uppercase tracking-wider" style={{ color: tier.c }}>{tier.label}</span>
                            <span className="text-[9px] font-bold text-white/45">+{a.xp} XP</span>
                          </div>
                          <div className="h-[5px] rounded-full bg-white/[0.06] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${p}%`, background: unlocked ? tier.c : `${tier.c}66` }} /></div>
                          <p className="text-[9px] text-white/35 mt-0.5 tabular-nums">{unlocked ? "Unlocked" : `${a.cur.toLocaleString()} / ${a.target.toLocaleString()}`}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* ═══ ACTIVITY ═══ */}
        {tab === "Activity" && (
          <div className="mt-4 space-y-3">
            <Card
              title="Activity Heatmap"
              right={
                <div className="flex items-center gap-1 rounded-full border border-white/10 bg-black/30 p-0.5">
                  {(["week", "month", "year"] as const).map((r) => (
                    <button key={r} onClick={() => setRange(r)} className="px-2 py-0.5 rounded-full text-[10px] font-bold capitalize transition-colors" style={range === r ? { background: accent, color: "#08080c" } : { color: "rgba(255,255,255,0.5)" }}>{r}</button>
                  ))}
                </div>
              }
            >
              <div className="flex flex-wrap gap-[3px]">
                {heatmap.map((c) => <div key={c.key} title={`${c.key}: ${c.count}`} className="w-[12px] h-[12px] rounded-[2px]" style={{ background: heatColor(c.count) }} />)}
              </div>
            </Card>

            <Card title="Weekly Rhythm" right={<span className="text-xs text-white/40">most active day</span>}>
              <div className="flex items-end gap-2 h-24 pt-1">
                {weekdayCounts.map((v, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full rounded-t-sm flex items-end justify-center" style={{ height: `${(v / weekdayMax) * 100}%`, minHeight: v ? 4 : 2, background: v === weekdayMax && v > 0 ? accent : `${accent}44` }} />
                    <span className="text-[9px] text-white/40">{WEEKDAYS[i]}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Recent Episodes">
              {recently.length === 0 ? <Empty text="No activity yet." /> : (
                <div className="space-y-1.5">
                  {recently.map((h) => (
                    <button key={h.id} onClick={() => navigate({ page: "watch", id: h.animeId, episode: h.episodeNum, title: h.animeName, image: h.thumbnail })} className="w-full flex items-center gap-2.5 rounded-lg hover:bg-white/[0.04] p-1 text-left transition-colors">
                      <div className="w-8 h-10 rounded overflow-hidden bg-white/5 shrink-0">{h.thumbnail && <img src={h.thumbnail} alt="" className="w-full h-full object-cover" />}</div>
                      <div className="min-w-0 flex-1"><p className="text-sm font-semibold truncate">{h.animeName}</p><p className="text-white/40 text-[11px]">Episode {h.episodeNum} · {new Date(h.updatedAt).toLocaleDateString()}</p></div>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ═══ SETTINGS ═══ */}
        {tab === "Settings" && (
          <div className="mt-4">
          {/* Settings header — names the area and says what it covers, instead
              of dropping straight into an unlabelled two-column form. */}
          <div className="mb-4 pb-4 border-b border-white/[0.07]">
            <h1 className="font-black text-2xl sm:text-3xl leading-none" style={{ fontFamily: FONT }}>Settings</h1>
            <p className="text-white/45 text-sm mt-1.5">Manage your account, playback and appearance preferences.</p>
          </div>

          <div className="flex flex-col lg:flex-row gap-4">
            {/* sub-nav */}
            <aside className="lg:w-[272px] shrink-0">
              <DonateCard />
              <nav className="flex lg:flex-col gap-1.5 overflow-x-auto pb-1 lg:pb-0" style={{ scrollbarWidth: "none" }}>
                {SETTINGS_TABS.map((t) => {
                  const on = sTab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setSTab(t.id)}
                      className={`group relative flex items-center gap-2.5 px-3.5 py-3 rounded-xl text-sm font-bold whitespace-nowrap transition-all duration-200 text-left shrink-0 lg:w-full ${
                        // Solid white tile with dark text for the selected
                        // section — reads far harder than a tinted wash.
                        on ? "bg-white text-[#08080c] shadow-sm" : "text-white/50 hover:text-white hover:bg-white/[0.06]"
                      }`}
                    >
                      <span className="grid place-items-center shrink-0">
                        <Icon path={t.icon} size={16} />
                      </span>
                      {t.label}
                    </button>
                  );
                })}
              </nav>
            </aside>

            <div className="flex-1 min-w-0">
              {/* ── ACCOUNT ── */}
              {sTab === "account" && (
                <div className="space-y-4">
                  <SectionHead title="Account" desc="Your profile, linked trackers and stored data" accent={accent} />
                  <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm p-4 sm:p-5">
                    <div className="flex items-start gap-4">
                      <div className="relative shrink-0 w-16 h-16">
                        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[78%] h-[78%] z-[1]">
                          <div className="w-full h-full rounded-full flex items-center justify-center text-xl font-black overflow-hidden" style={{ background: `${accent}33`, color: accent }}>
                            {user.avatarImage ? <img src={user.avatarImage} alt="" className="w-full h-full object-cover" loading="eager" /> : avatarChar}
                          </div>
                        </div>
                        {frameSrc && <img src={frameSrc} alt="" aria-hidden loading="lazy" decoding="async" className="pointer-events-none absolute inset-0 w-full h-full max-w-none select-none z-[2]" />}
                      </div>
                      <div className="flex-1 space-y-3 min-w-0">
                        <button onClick={() => setShowPicker(true)} className="text-xs font-bold text-white/50 hover:text-white transition-colors inline-flex items-center gap-1.5">
                          <Icon path="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" size={11} />
                          Edit Avatar & Frame
                        </button>
                        <div>
                          <label className="text-[10px] font-bold text-white/50 uppercase tracking-wide">Username (Login ID)</label>
                          <input value={user.username} readOnly className="w-full mt-1 rounded-lg border border-white/[0.08] bg-black/40 px-3 py-1.5 text-sm text-white/50 cursor-not-allowed" />
                          <p className="text-[10px] text-white/35 mt-0.5">Set during signup and cannot be changed.</p>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-white/50 uppercase tracking-wide">Email Address</label>
                          <input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full mt-1 rounded-lg border border-white/[0.08] bg-black/40 px-3 py-1.5 text-sm outline-none focus:border-white/25 transition-colors" />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-white/50 uppercase tracking-wide">Display Name</label>
                          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full mt-1 rounded-lg border border-white/[0.08] bg-black/40 px-3 py-1.5 text-sm outline-none focus:border-white/25 transition-colors" />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-white/50 uppercase tracking-wide">Bio</label>
                          <input value={bio} onChange={(e) => setBio(e.target.value)} className="w-full mt-1 rounded-lg border border-white/[0.08] bg-black/40 px-3 py-1.5 text-sm outline-none focus:border-white/25 transition-colors" />
                        </div>
                        <div className="flex gap-2 pt-0.5">
                          <button onClick={() => { setName(user.name || ""); setEmail(user.email || ""); setBio(user.bio || ""); setEmoji(user.avatarEmoji || ""); setTagline(user.tagline || ""); setFavs(user.favorites || []); }} className="flex-1 rounded-lg border border-white/10 py-1.5 text-sm font-bold hover:bg-white/5 transition-colors">Reset</button>
                          <button onClick={saveAccount} disabled={!dirty} className="flex-1 rounded-lg py-1.5 text-sm font-bold transition-colors disabled:opacity-40" style={{ background: accent, color: "#05060a" }}>{saved ? "Saved ✓" : "Save Changes"}</button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Customize profile */}
                  <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm p-4 sm:p-5 space-y-4">
                    <h3 className="font-bold text-sm" style={{ fontFamily: FONT }}>Customize Profile</h3>
                    <div>
                      <label className="text-[10px] font-bold text-white/50 uppercase tracking-wide">Avatar Color</label>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {AVATAR_COLORS.map((c) => (
                          <button key={c} onClick={() => setAvatarColor(c)} className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110" style={{ background: c, borderColor: accent === c ? "#fff" : "transparent" }} aria-label={c} />
                        ))}
                      </div>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-white/50 uppercase tracking-wide">Avatar Emoji</label>
                        <input value={emoji} maxLength={2} onChange={(e) => setEmoji(e.target.value)} placeholder="e.g. 🔥" className="w-full mt-1 rounded-lg border border-white/[0.08] bg-black/40 px-3 py-1.5 text-sm outline-none focus:border-white/25 transition-colors" />
                        <p className="text-[10px] text-white/35 mt-0.5">Shown instead of your initial. Leave blank to use the letter.</p>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-white/50 uppercase tracking-wide">Tagline</label>
                        <input value={tagline} maxLength={60} onChange={(e) => setTagline(e.target.value)} placeholder="A short flair under your name" className="w-full mt-1 rounded-lg border border-white/[0.08] bg-black/40 px-3 py-1.5 text-sm outline-none focus:border-white/25 transition-colors" />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-white/50 uppercase tracking-wide">Favorite Genres</label>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {GENRES.map((g) => {
                          const on = favs.includes(g);
                          return (
                            <button key={g} onClick={() => toggleFav(g)} className="text-[11px] font-semibold rounded-md px-2.5 py-1 transition-colors border" style={on ? { background: `${accent}18`, color: accent, borderColor: `${accent}40` } : { background: "transparent", color: "rgba(255,255,255,0.5)", borderColor: "rgba(255,255,255,0.10)" }}>{g}</button>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-white/35 mt-1.5">Shown on your Overview. Press Save Changes to apply.</p>
                    </div>
                  </div>

                  <Row icon={ICONS.shield} accent={accent} title="Account Privacy (Public)" desc="When enabled, your media list is public. Disable to make it private.">
                    <Toggle on={prefs.privacyPublic} onClick={() => setPref("privacyPublic", !prefs.privacyPublic)} accent={accent} />
                  </Row>

                  <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-bold text-sm">Change Password</p>
                        <p className="text-white/45 text-[11px] mt-0.5">Update your password to keep your account secure.</p>
                      </div>
                      <button onClick={() => setShowPw((v) => !v)} className="rounded-lg border border-white/12 px-3 py-1.5 text-xs font-bold hover:bg-white/5 transition-colors shrink-0">Change</button>
                    </div>
                    {showPw && (
                      <div className="mt-3 space-y-1.5">
                        <input type="password" placeholder="Current password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} className="w-full rounded-lg border border-white/[0.08] bg-black/40 px-3 py-1.5 text-sm outline-none focus:border-white/25 transition-colors" />
                        <input type="password" placeholder="New password (min 6 chars)" value={newPw} onChange={(e) => setNewPw(e.target.value)} className="w-full rounded-lg border border-white/[0.08] bg-black/40 px-3 py-1.5 text-sm outline-none focus:border-white/25 transition-colors" />
                        {pwMsg && <p className="text-xs" style={{ color: pwMsg.includes("updated") ? "#34D399" : "#f87171" }}>{pwMsg}</p>}
                        <button onClick={doChangePw} className="rounded-lg px-3 py-1.5 text-xs font-bold" style={{ background: accent, color: "#05060a" }}>Update Password</button>
                      </div>
                    )}
                  </div>

                  <Row icon={ICONS.shield} accent={accent} title="Incognito Mode" desc="Prevent saving your watch history and adding anime to your lists.">
                    <Toggle on={prefs.incognito} onClick={() => setPref("incognito", !prefs.incognito)} accent={accent} />
                  </Row>

                  <div>
                    <h3 className="font-bold text-sm mb-0.5">External Trackers</h3>
                    <p className="text-white/45 text-[11px] mb-2">Sync your watch progress with AniList or MyAnimeList.</p>
                    <div className="space-y-2">
                      <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm px-4 py-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded-md flex items-center justify-center font-black text-[9px] shrink-0" style={{ background: "#02a9ff18", color: "#02a9ff" }}>AL</div>
                          <div className="min-w-0">
                            <p className="font-bold text-sm flex items-center gap-1.5">AniList {anilistUser && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "#34D39918", color: "#34D399" }}>CONNECTED</span>}</p>
                            <p className="text-white/45 text-[11px] truncate">{anilistUser ? `Signed in as ${anilistUser.name}` : "Not connected"}</p>
                          </div>
                        </div>
                        {anilistUser ? (
                          <button onClick={clearAnilistAuth} className="rounded-lg border border-red-500/30 text-red-400 px-3 py-1.5 text-xs font-bold hover:bg-red-500/10 transition-colors shrink-0">Disconnect</button>
                        ) : isAniListConfigured() ? (
                          <a href={getAniListAuthUrl()} className="rounded-lg px-3 py-1.5 text-xs font-bold shrink-0" style={{ background: accent, color: "#05060a" }}>Connect</a>
                        ) : (
                          <span className="text-[11px] text-white/40 shrink-0">Coming soon</span>
                        )}
                      </div>
                      <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm px-4 py-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded-md flex items-center justify-center font-black text-[9px] shrink-0" style={{ background: "#2e51a218", color: "#5f7fc9" }}>MAL</div>
                          <div className="min-w-0">
                            <p className="font-bold text-sm">MyAnimeList</p>
                            <p className="text-white/45 text-[11px] truncate">Sync your media list and tracking progress.</p>
                          </div>
                        </div>
                        <span className="text-[11px] text-white/40 shrink-0">Coming soon</span>
                      </div>
                    </div>
                  </div>

                  {/* Data management */}
                  <div>
                    <h3 className="font-bold text-sm mb-0.5">Your Data</h3>
                    <p className="text-white/45 text-[11px] mb-2">Export a copy of your library, or clear what's stored on this device.</p>
                    <div className="space-y-2">
                      <Row icon={ICONS.share} accent={accent} title="Export My Data" desc="Download your history, bookmarks and library as a JSON file.">
                        <button onClick={exportData} className="inline-flex items-center gap-1 rounded-lg border border-white/12 px-3 py-1.5 text-xs font-bold hover:bg-white/5 transition-colors"><Icon path={ICONS.share} size={12} /> Export</button>
                      </Row>
                      <Row icon={ICONS.clock} accent={accent} title="Clear Watch History" desc="Remove every entry from your watch history.">
                        <button onClick={clearHistory} className="rounded-lg border border-white/12 px-3 py-1.5 text-xs font-bold hover:bg-white/5 transition-colors">Clear</button>
                      </Row>
                      <Row icon={ICONS.layers} accent={accent} title="Clear All Data" desc="Wipe your history and bookmarks from this device.">
                        <button onClick={clearAllData} className="rounded-lg border border-amber-500/30 text-amber-300 px-3 py-1.5 text-xs font-bold hover:bg-amber-500/10 transition-colors">Clear all</button>
                      </Row>
                    </div>
                  </div>

                  <div className="rounded-xl border border-red-500/20 bg-red-500/[0.04] backdrop-blur-sm px-4 py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-bold text-sm text-red-300">Delete account</p>
                      <p className="text-white/45 text-[11px] mt-0.5">This action is irreversible. All data will be permanently deleted.</p>
                    </div>
                    <button onClick={() => { if (confirm("Delete your account? This cannot be undone.")) { logout(); navigate({ page: "home" }); } }} className="rounded-lg bg-red-500/90 hover:bg-red-500 text-white px-3 py-1.5 text-xs font-bold shrink-0 transition-colors">Delete account</button>
                  </div>
                </div>
              )}

              {/* ── GENERAL ── */}
              {sTab === "general" && (
                <div className="space-y-4">
                  <SectionHead title="General" desc="Language, region and how the app behaves day to day" accent={accent} />
                  <div className="space-y-2">
                    <Row icon={ICONS.film} accent={accent} title="Homepage Trailer" desc="Control video previews on the homepage. Turn off to save bandwidth."><Toggle on={prefs.homepageTrailer} onClick={() => setPref("homepageTrailer", !prefs.homepageTrailer)} accent={accent} /></Row>
                    <Row icon={ICONS.chat} accent={accent} title="Title Language" desc="Switch between Japanese (romaji) and English titles for anime."><Segmented value={prefs.titleLanguage} onChange={(v) => setPref("titleLanguage", v)} accent={accent} options={[{ v: "english", label: "English" }, { v: "romaji", label: "Romaji" }]} /></Row>
                    <Row icon={ICONS.layers} accent={accent} title="Episode Thumbnails" desc="Show episode thumbnails and descriptions. Disable to display only episode numbers."><Toggle on={prefs.episodeThumbnails} onClick={() => setPref("episodeThumbnails", !prefs.episodeThumbnails)} accent={accent} /></Row>
                    <Row icon={ICONS.sliders} accent={accent} title="Episode Sort Order" desc="Ascending shows Episode 1 first. Descending shows the latest first."><Segmented value={prefs.episodeSortAsc ? "asc" : "desc"} onChange={(v) => setPref("episodeSortAsc", v === "asc")} accent={accent} options={[{ v: "asc", label: "Ascending" }, { v: "desc", label: "Descending" }]} /></Row>
                    <Row icon={ICONS.chat} accent={accent} title="Preferred Language" desc="Sub plays Japanese audio with subtitles. Dub plays English audio when available."><Segmented value={prefs.preferredLanguage} onChange={(v) => setPref("preferredLanguage", v)} accent={accent} options={[{ v: "sub", label: "Sub" }, { v: "dub", label: "Dub" }]} /></Row>
                    <Row icon={ICONS.shield} accent={accent} title="NSFW Content" desc="Adult content is hidden by default. Enable to browse adult anime."><Toggle on={prefs.nsfw} onClick={() => setPref("nsfw", !prefs.nsfw)} accent={accent} /></Row>
                    <Row icon={ICONS.chat} accent={accent} title="Comments" desc="Enable or disable the comments section on anime pages."><Toggle on={prefs.comments} onClick={() => setPref("comments", !prefs.comments)} accent={accent} /></Row>
                  </div>
                </div>
              )}

              {/* ── PLAYER ── */}
              {sTab === "player" && (
                <div className="space-y-4">
                  <SectionHead title="Player" desc="Playback defaults, autoplay and skip behaviour" accent={accent} />
                  <div className="space-y-2">
                    <Row icon={ICONS.play} accent={accent} title="Autonext" desc="Automatically play the next episode after the current one."><Toggle on={prefs.autoNext} onClick={() => setPref("autoNext", !prefs.autoNext)} accent={accent} /></Row>
                    <Row icon={ICONS.bolt} accent={accent} title="Autoskip" desc="Automatically skip detected opening and ending sequences."><Toggle on={prefs.autoSkip} onClick={() => setPref("autoSkip", !prefs.autoSkip)} accent={accent} /></Row>
                    <Row icon={ICONS.play} accent={accent} title="Autoplay" desc="Automatically start playing the episode on page load."><Toggle on={prefs.autoplay} onClick={() => setPref("autoplay", !prefs.autoplay)} accent={accent} /></Row>
                    <Row icon={ICONS.film} accent={accent} title="Mute Audio" desc="Always mute the audio before playing."><Toggle on={prefs.muteAudio} onClick={() => setPref("muteAudio", !prefs.muteAudio)} accent={accent} /></Row>
                    <Row icon={ICONS.clock} accent={accent} title="Skip Forward" desc="Skip forward in the player by a custom interval (seconds)."><input type="number" min={5} max={90} value={prefs.skipForward} onChange={(e) => setPref("skipForward", Math.max(5, Math.min(90, +e.target.value || 85)))} className="w-18 rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-center outline-none focus:border-white/25 transition-colors" /></Row>
                    <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm px-4 py-3">
                      <div className="flex items-center justify-between mb-2"><p className="font-bold text-sm">Playback Rate</p><span className="text-xs font-bold" style={{ color: accent }}>{prefs.playbackRate}x</span></div>
                      <input type="range" min={0.25} max={2} step={0.25} value={prefs.playbackRate} onChange={(e) => setPref("playbackRate", +e.target.value)} className="w-full" style={{ accentColor: accent }} />
                    </div>
                    <Row icon={ICONS.star} accent={accent} title="Video Quality" desc="The player will try to match this quality when available."><Segmented value={prefs.quality} onChange={(v) => setPref("quality", v)} accent={accent} options={[{ v: "auto", label: "Auto" }, { v: "480", label: "480p" }, { v: "720", label: "720p" }, { v: "1080", label: "1080p" }]} /></Row>
                    <Row icon={ICONS.bolt} accent={accent} title="Load Strategy" desc="Control when video loading begins. Loading eagerly can slow the page."><Segmented value={prefs.loadStrategy} onChange={(v) => setPref("loadStrategy", v)} accent={accent} options={[{ v: "idle", label: "Idle" }, { v: "visible", label: "Visible" }, { v: "eager", label: "Eager" }]} /></Row>
                    <Row icon={ICONS.layers} accent={accent} title="Skip Fillers" desc="Skip filler episodes when auto-playing or pressing next."><Toggle on={prefs.skipFillers} onClick={() => setPref("skipFillers", !prefs.skipFillers)} accent={accent} /></Row>
                    <Row icon={ICONS.palette} accent={accent} title="Ambient Mode" desc="Immersive ambient lighting effects around the video player."><Toggle on={prefs.ambientMode} onClick={() => setPref("ambientMode", !prefs.ambientMode)} accent={accent} /></Row>
                    <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm px-4 py-3">
                      <div className="flex items-center justify-between mb-2"><p className="font-bold text-sm">Volume</p><span className="text-xs font-bold" style={{ color: accent }}>{prefs.volume}%</span></div>
                      <input type="range" min={0} max={100} value={prefs.volume} onChange={(e) => setPref("volume", +e.target.value)} className="w-full" style={{ accentColor: accent }} />
                    </div>
                  </div>
                </div>
              )}

              {/* ── SUBTITLES ──
                   Writes through useSubtitleSettings, the same localStorage
                   store the player reads, so anything changed here is live on
                   the next episode without a separate sync step. */}
              {sTab === "subtitles" && (
                <div className="space-y-4">
                  <SectionHead title="Subtitles" desc="Font, size, position and timing for subtitle playback" accent={accent} />

                  {/* Live preview */}
                  <Card title="Preview">
                    <div className="relative rounded-xl overflow-hidden bg-black h-28 grid place-items-center border border-white/[0.06]">
                      <div
                        className="absolute inset-x-0 flex justify-center px-3"
                        style={{ top: `${Math.min(Math.max(subs.verticalPos, 10), 90)}%`, transform: "translateY(-50%)" }}
                      >
                        <span
                          className="font-bold text-center leading-snug px-2 py-0.5 rounded"
                          style={{
                            fontFamily: subs.fontFamily,
                            fontSize: `${Math.min(subs.fontSize, 28)}px`,
                            color: "#fff",
                            background: `rgba(0,0,0,${subs.bgOpacity / 100})`,
                            textShadow: subs.bgOpacity < 20 ? "0 2px 6px rgba(0,0,0,0.95)" : "none",
                          }}
                        >
                          This is what your subtitles look like.
                        </span>
                      </div>
                    </div>
                  </Card>

                  <Card title="Text">
                    <div className="space-y-4">
                      <div>
                        <p className="text-xs font-bold text-white/70 mb-1.5">Font</p>
                        <select
                          value={subs.fontFamily}
                          onChange={(e) => updateSubs({ fontFamily: e.target.value })}
                          className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-white/25 transition-colors"
                        >
                          {FONT_OPTIONS.map((f) => (
                            <option key={f.value} value={f.value}>{f.label}</option>
                          ))}
                        </select>
                      </div>
                      <SettingSlider label="Font size" value={subs.fontSize} min={12} max={48} unit="px" accent={accent} onChange={(v) => updateSubs({ fontSize: v })} />
                      <SettingSlider label="Background opacity" value={subs.bgOpacity} min={0} max={100} unit="%" accent={accent} onChange={(v) => updateSubs({ bgOpacity: v })} />
                    </div>
                  </Card>

                  <Card title="Position & timing">
                    <div className="space-y-4">
                      <SettingSlider label="Vertical position" value={subs.verticalPos} min={0} max={100} unit="%" accent={accent} onChange={(v) => updateSubs({ verticalPos: v })} />
                      <SettingSlider label="Horizontal position" value={subs.horizontalPos} min={0} max={100} unit="%" accent={accent} onChange={(v) => updateSubs({ horizontalPos: v })} />
                      <SettingSlider label="Sync delay" value={subs.syncDelay} min={-10} max={10} step={0.1} unit="s" accent={accent} onChange={(v) => updateSubs({ syncDelay: v })} />
                      <p className="text-[11px] text-white/35 -mt-1">Positive delay shows subtitles later; negative shows them earlier.</p>
                    </div>
                  </Card>

                  <div className="flex items-center justify-between rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3.5">
                    <div>
                      <p className="font-bold text-sm">Reset subtitle settings</p>
                      <p className="text-white/45 text-[11px] mt-0.5">Restore font, size, position and timing to their defaults.</p>
                    </div>
                    <button onClick={resetSubs} className="rounded-lg border border-white/12 px-3 py-1.5 text-xs font-bold hover:bg-white/5 transition-colors">
                      Reset
                    </button>
                  </div>
                </div>
              )}

              {/* ── KEYBOARD ── */}
              {sTab === "keyboard" && (
                <div className="space-y-4">
                  <SectionHead title="Keyboard" desc="Shortcuts available in the player and across the site" accent={accent} />
                  <Card>
                    <div className="divide-y divide-white/[0.06]">
                      {KEY_SHORTCUTS.map((s) => (
                        <div key={s.action} className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
                          <span className="text-sm text-white/75">{s.action}</span>
                          <span className="flex items-center gap-1 shrink-0">
                            {s.keys.map((k, i) => (
                              <span key={k} className="flex items-center gap-1">
                                {i > 0 && <span className="text-[10px] text-white/25">/</span>}
                                <kbd className="rounded-md border border-white/12 bg-black/50 px-2 py-1 text-[11px] font-bold text-white/80 min-w-[26px] text-center">
                                  {k}
                                </kbd>
                              </span>
                            ))}
                          </span>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              )}

              {/* ── APPEARANCE (themes) ── */}
              {sTab === "appearance" && (
                <div className="space-y-4">
                  <div>
                    <SectionHead title="Appearance" desc="Accent colour, banner and profile styling" accent={accent} />
                    <p className="text-white/45 text-[11px] mt-0.5">Choose a color scheme. Saved on this device.</p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {THEMES.map((t) => {
                      const active = prefs.theme === t.key;
                      return (
                        <button key={t.key} onClick={() => pickTheme(t.key, t.accent)} className="text-left rounded-xl border p-2 transition-colors" style={{ borderColor: active ? t.accent : "rgba(255,255,255,0.08)", background: active ? `${t.accent}08` : "transparent" }}>
                          <div className="relative rounded-lg overflow-hidden aspect-[4/3] mb-2" style={{ background: t.bg }}>
                            <div className="absolute top-2 left-2 flex gap-1">
                              <span className="w-[5px] h-[5px] rounded-full" style={{ background: t.accent }} />
                              {t.dot2 && <span className="w-[5px] h-[5px] rounded-full" style={{ background: t.dot2 }} />}
                            </div>
                            {active && <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: t.accent }}><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="#05060a" strokeWidth={4}><path d="M5 12l5 5L20 7" /></svg></span>}
                            <div className="absolute inset-x-2 bottom-2 space-y-1">
                              <div className="h-1 rounded-full bg-white/15 w-3/4" />
                              <div className="h-1 rounded-full bg-white/10 w-1/2" />
                            </div>
                          </div>
                          <div className="flex items-center justify-between px-0.5 pb-0.5">
                            <span className="text-sm font-bold">{t.name}</span>
                            {active && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: `${t.accent}18`, color: t.accent }}>Active</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Avatar frame picker */}
                  <div>
                    <h3 className="font-bold text-sm" style={{ fontFamily: FONT }}>Avatar Frame</h3>
                    <p className="text-white/45 text-[11px] mt-0.5 mb-2">A decorative frame around your avatar.</p>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {FRAMES.map((f) => {
                        const active = (user.avatarFrame || "none") === f.key;
                        return (
                          <button key={f.key} onClick={() => setFrame(f.key)} className="rounded-xl border p-2 flex flex-col items-center gap-1.5 transition-colors" style={{ borderColor: active ? accent : "rgba(255,255,255,0.08)", background: active ? `${accent}08` : "transparent" }}>
                            <div className="relative w-14 h-14">
                              <div className="w-full h-full rounded-full flex items-center justify-center text-lg font-black border-2" style={{ background: `${accent}33`, color: accent, borderColor: "#08080c" }}>{avatarChar}</div>
                              {f.src && <img src={f.thumb || f.src} alt="" aria-hidden loading="lazy" decoding="async" className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[128%] h-[128%] max-w-none" />}
                            </div>
                            <span className="text-[11px] font-semibold text-center">{f.name}</span>
                            {active && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: `${accent}18`, color: accent }}>Equipped</span>}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-white/35 mt-2">Want a custom frame? Drop a transparent PNG into <code className="text-white/50">public/frames/</code>.</p>
                  </div>
                </div>
              )}

              {/* ── ABOUT ── */}
              {sTab === "about" && (
                <div className="space-y-4">
                  <SectionHead title="About" desc="Version, credits and project links" accent={accent} />
                  <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm p-4 text-center">
                    <img src="/logo-sidebar.png" alt="LuffyTV" className="h-8 mx-auto mb-3" />
                    <p className="text-white/60 text-[11px] max-w-md mx-auto leading-relaxed">LuffyTV is a free home for anime, manga and novels — one library, no ads, no paywalls.</p>
                    <p className="text-white/35 text-[10px] mt-3">Version 1.0 · Fan-made, not affiliated with any studio.</p>
                    <div className="flex items-center justify-center gap-2 mt-4">
                      <a href="https://discord.gg/GEVes3uhtM" target="_blank" rel="noopener noreferrer" className="rounded-lg border border-white/12 px-3 py-1.5 text-xs font-bold hover:bg-white/5 transition-colors">Discord</a>
                      <button onClick={() => navigate({ page: "contact" })} className="rounded-lg border border-white/12 px-3 py-1.5 text-xs font-bold hover:bg-white/5 transition-colors">Contact</button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm px-4 py-3">
                    <div><p className="font-bold text-sm">Sign out</p><p className="text-white/45 text-[11px] mt-0.5">Log out of your account on this device.</p></div>
                    <button onClick={() => { logout(); navigate({ page: "home" }); }} className="inline-flex items-center gap-1 rounded-lg border border-white/12 px-3 py-1.5 text-xs font-bold hover:bg-white/5 transition-colors"><Icon path={ICONS.logout} size={13} /> Log out</button>
                  </div>
                </div>
              )}
            </div>
          </div>
          </div>
        )}
      </div>

      <AvatarPickerModal
        open={showPicker}
        onClose={() => setShowPicker(false)}
        accent={accent}
        avatarChar={avatarChar}
        currentAvatarImage={user.avatarImage}
        currentBannerImage={user.bannerImage}
        currentFrame={user.avatarFrame}
        history={history}
        onApply={(patch) => {
          const clean = {
            ...(patch.avatarImage !== undefined ? { avatarImage: patch.avatarImage ?? undefined } : {}),
            ...(patch.bannerImage !== undefined ? { bannerImage: patch.bannerImage ?? undefined } : {}),
            ...(patch.avatarFrame !== undefined ? { avatarFrame: patch.avatarFrame } : {}),
          };
          updateUserProfile(user.id, clean);
          setUser({ ...user, ...clean });
        }}
      />
    </div>
  );
}
