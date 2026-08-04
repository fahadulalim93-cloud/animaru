"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useAppStore } from "./store";
import { getDeviceToken, getMyRole } from "@/lib/auth-local";
import { frameSrcOf } from "./avatar-frames";

const FONT = "var(--font-inter), Inter, system-ui, sans-serif";

// ─── Interfaces ───

interface ModMember {
  username: string;
  name: string;
  createdAt: string;
  lastSeen: number;
  status: "active" | "banned" | "suspended";
  until: number | null;
  isMod: boolean;
  isOwner: boolean;
}
interface ReportRow {
  id: string;
  kind: "mod" | "watch";
  byUsername: string;
  byName: string;
  message: string;
  meta?: { animeTitle?: string; episodeNum?: number; server?: string; mode?: string; error?: string; url?: string };
  createdAt: number;
  status: "open" | "resolved";
}
interface WarnRow { id: string; username: string; byUsername: string; byName: string; reason: string; createdAt: number; }
interface LogRow { id: string; actorUsername: string; action: string; targetUsername: string; reason?: string; createdAt: number; }
interface Overview { totalComments: number; totalCollections: number; totalViews: number; onlineNow: number; }

type Tab = "overview" | "comments" | "reports" | "warns" | "bans" | "logs" | "timeouts" | "modlogs" | "activity";

const NAV: { section: string; items: { id: Tab; label: string; icon: string }[] }[] = [
  { section: "GENERAL", items: [{ id: "overview", label: "Overview", icon: "grid" }] },
  { section: "MODERATION", items: [
    { id: "comments", label: "Comments", icon: "chat" },
    { id: "reports", label: "Reports", icon: "flag" },
    { id: "warns", label: "User Warns", icon: "warning" },
    { id: "bans", label: "User Bans", icon: "ban" },
    { id: "logs", label: "User Logs", icon: "history" },
    { id: "timeouts", label: "Timeouts", icon: "stopwatch" },
    { id: "modlogs", label: "Mod Logs", icon: "doc" },
  ] },
  { section: "ANALYTICS", items: [{ id: "activity", label: "Activity", icon: "pulse" }] },
];

// ─── Lucide-style SVG Icons ───

const SVG_PATHS: Record<string, string> = {
  grid: "M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z",
  chat: "M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z",
  flag: "M4 3v18M4 4h13l-2 4 2 4H4",
  warning: "M12 9v4m0 4h.01M10.29 3.86l-8.18 14.18A1.5 1.5 0 003.34 20.5h17.32a1.5 1.5 0 001.23-2.46L13.71 3.86a1.5 1.5 0 00-2.42 0z",
  ban: "M12 21a9 9 0 100-18 9 9 0 000 18zM5.6 5.6l12.8 12.8",
  history: "M3 12a9 9 0 109-9M3 12h5m-5 0V7M12 8v4l3 3",
  stopwatch: "M12 8v4l2.5 2.5M10 2h4M12 22a8 8 0 100-16 8 8 0 000 16z",
  doc: "M6 2h9l5 5v15H6V2zm9 0v5h5",
  pulse: "M13 2 4 14h6l-1 8 9-12h-6l1-8z",
  refresh: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
  chevron: "M6 9l6 6 6-6",
  // Extra icons for enhanced stats
  users: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 3a4 4 0 100 8 4 4 0 000-8zm12 10v2m0 0a3 3 0 10-6 0 3 3 0 006 0zm0 0v2",
  eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 100 6 3 3 0 000-6z",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  bookmark: "M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z",
  search: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
  clock: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zm0-6V12l-4-2",
  trending: "M23 6l-9.5 9.5-5-5L1 18",
  // Moderation icons
  exclamation: "M12 9v4m0 4h.01M10.29 3.86l-8.18 14.18A1.5 1.5 0 003.34 20.5h17.32a1.5 1.5 0 001.23-2.46L13.71 3.86a1.5 1.5 0 00-2.42 0z",
};

function NavIcon({ name, size = 17 }: { name: string; size?: number }) {
  return (
    <svg className={`w-[${size}px] h-[${size}px] shrink-0`} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={SVG_PATHS[name] || SVG_PATHS.grid} />
    </svg>
  );
}

// ─── Status Badge ───

function StatusBadge({ status, until }: { status: ModMember["status"]; until: number | null }) {
  if (status === "banned") return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/20">BANNED</span>;
  if (status === "suspended") return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/20">SUSPENDED{until ? ` · ${new Date(until).toLocaleDateString()}` : ""}</span>;
  return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">ACTIVE</span>;
}

// ─── Stat Card (Discord-style with colored icon bg) ───

function StatCard({ label, value, icon, color }: { label: string; value: number | string; icon: string; color: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#1e1f22] p-5 hover:border-white/[0.10] transition-colors">
      <div className="flex items-start justify-between mb-3">
        <p className="text-[13px] font-medium text-[#949ba4]">{label}</p>
        <div className="w-[36px] h-[36px] rounded-[10px] flex items-center justify-center" style={{ backgroundColor: color + "18", color }}>
          <NavIcon name={icon} size={18} />
        </div>
      </div>
      <p className="text-[28px] font-bold text-[#f2f3f5] tracking-tight" style={{ fontFeatureSettings: '"tnum"' }}>{value}</p>
    </div>
  );
}

// ─── Section Label ───

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-bold text-[#949ba4] uppercase tracking-[0.05em] mb-3">{children}</p>;
}

// ─── Search Input ───

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <NavIcon name="search" size={14} />
      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-[14px] h-[14px] text-[#949ba4]" width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d={SVG_PATHS.search} />
      </svg>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-[#1e1f22] border border-white/[0.06] text-sm text-[#f2f3f5] placeholder-[#949ba4]/60 outline-none focus:border-white/[0.15] transition-colors"
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Main ModPanel Component
// ═══════════════════════════════════════════════════════════════

export default function ModPanel() {
  const user = useAppStore((s) => s.user);
  const navigate = useAppStore((s) => s.navigate);

  const [roleChecked, setRoleChecked] = useState(false);
  const [isMod, setIsMod] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [members, setMembers] = useState<ModMember[] | null>(null);
  const [reports, setReports] = useState<ReportRow[] | null>(null);
  const [warns, setWarns] = useState<WarnRow[] | null>(null);
  const [logs, setLogs] = useState<LogRow[] | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [bump, setBump] = useState(0);

  useEffect(() => {
    let cancel = false;
    Promise.resolve().then(async () => {
      if (!user) return "member" as const;
      return getMyRole(user.username);
    }).then((r) => { if (!cancel) { setIsMod(r === "mod"); setRoleChecked(true); } });
    return () => { cancel = true; };
  }, [user]);

  const authQS = useMemo(() => user ? `u=${encodeURIComponent(user.username)}&token=${encodeURIComponent(getDeviceToken())}` : "", [user]);

  useEffect(() => {
    if (!isMod || !user) return;
    let cancel = false;
    const get = (path: string) => fetch(`${path}?${authQS}`, { cache: "no-store" }).then((r) => r.json()).catch(() => ({ ok: false }));
    Promise.all([
      get("/api/mod/moderation"), get("/api/mod/reports"), get("/api/mod/warns"), get("/api/mod/logs"), get("/api/mod/overview"),
    ]).then(([m, r, w, l, o]) => {
      if (cancel) return;
      if (m.ok) setMembers(m.members);
      if (r.ok) setReports(r.reports);
      if (w.ok) setWarns(w.warns);
      if (l.ok) setLogs(l.logs);
      if (o.ok) setOverview({ totalComments: o.totalComments, totalCollections: o.totalCollections, totalViews: o.totalViews, onlineNow: o.onlineNow });
    });
    return () => { cancel = true; };
  }, [isMod, user, authQS, bump]);

  const refresh = () => setBump((b) => b + 1);

  const act = useCallback(async (targetUsername: string, action: "ban" | "unban" | "suspend" | "unsuspend", opts?: { reason?: string; hours?: number }) => {
    if (!user) return;
    await fetch("/api/mod/moderation", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ u: user.username, token: getDeviceToken(), targetUsername, action, ...opts }),
    }).catch(() => {});
    refresh();
  }, [user]);

  const warnUser = useCallback(async (targetUsername: string, reason: string) => {
    if (!user) return { ok: false };
    const res = await fetch("/api/mod/warns", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ u: user.username, token: getDeviceToken(), targetUsername, reason }),
    }).then((r) => r.json()).catch(() => ({ ok: false }));
    refresh();
    return res;
  }, [user]);

  const resolveReport = async (id: string, status: "open" | "resolved") => {
    if (!user) return;
    await fetch("/api/mod/reports", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ u: user.username, token: getDeviceToken(), id, status }),
    }).catch(() => {});
    refresh();
  };

  // ─── Auth gates ───
  if (!user) return <div className="max-w-2xl mx-auto py-24 text-center text-[#949ba4]" style={{ fontFamily: FONT }}><p>Sign in to access Moderator Tools.</p></div>;
  if (!roleChecked) return <div className="flex items-center justify-center py-24"><div className="w-6 h-6 rounded-full border-2 border-[#949ba4]/30 border-t-[#f2f3f5] animate-spin" /></div>;
  if (!isMod) return <div className="max-w-2xl mx-auto py-24 text-center text-[#949ba4]" style={{ fontFamily: FONT }}><p>You don&apos;t have moderator access.</p></div>;

  // ─── Computed values ───
  const bannedMembers = (members || []).filter((m) => m.status === "banned");
  const suspendedMembers = (members || []).filter((m) => m.status === "suspended");
  const openReports = (reports || []).filter((r) => r.status === "open");
  const now = Date.now();
  const newThisWeek = (members || []).filter((m) => now - new Date(m.createdAt).getTime() <= 7 * 86400000).length;
  const newThisMonth = (members || []).filter((m) => now - new Date(m.createdAt).getTime() <= 30 * 86400000).length;
  const adminUsers = (members || []).filter((m) => m.isMod || m.isOwner).length;
  const pageLabel = NAV.flatMap((s) => s.items).find((i) => i.id === tab)?.label || "Overview";
  const navFrame = frameSrcOf(user.avatarFrame);

  return (
    <div className="-mx-4 lg:-mx-8 min-h-screen bg-[#111214] text-[#f2f3f5] flex" style={{ fontFamily: FONT }}>
      {/* ═══ Mobile overlay ═══ */}
      {mobileMenuOpen && <div className="fixed inset-0 z-[60] bg-black/60 lg:hidden" onClick={() => setMobileMenuOpen(false)} />}

      {/* ═══ SIDEBAR (Discord-style) ═══ */}
      <aside className={`w-[260px] shrink-0 bg-[#18181b] border-r border-white/[0.04] p-4 hidden md:flex flex-col fixed md:sticky top-0 bottom-0 z-[70] md:z-auto transition-transform ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}>
        {/* ── User Profile Card ── */}
        <div className="flex items-center gap-3 mb-6 p-2.5 rounded-xl bg-[#232428] border border-white/[0.06]">
          <div className="relative w-11 h-11 shrink-0">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[78%] h-[78%] z-[1]">
              <div className="w-full h-full rounded-full flex items-center justify-center text-sm font-black overflow-hidden" style={{ backgroundColor: (user.avatarColor || "#7c3aed") + "44", color: user.avatarColor || "#7c3aed" }}>
                {user.avatarImage ? <img src={user.avatarImage} alt="" className="w-full h-full object-cover" loading="lazy" /> : (user.avatarEmoji || user.name.charAt(0)).toUpperCase()}
              </div>
            </div>
            {navFrame && <img src={navFrame} alt="" loading="lazy" className="pointer-events-none absolute inset-0 w-full h-full max-w-none select-none z-[2]" />}
            {!navFrame && <div className="absolute inset-0 rounded-full border border-white/10 z-[1] pointer-events-none" />}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm text-[#f2f3f5] leading-none truncate">{user.name || user.username}</p>
            <span className="inline-flex items-center gap-1.5 mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded bg-[#23a559]/15 text-[#23a559] border border-[#23a559]/20">
              <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="currentColor"><circle cx="5" cy="5" r="5" /></svg>
              MOD
            </span>
          </div>
        </div>

        {/* ── Navigation sections ── */}
        {NAV.map((group) => (
          <div key={group.section} className="mb-4">
            <button
              onClick={() => setCollapsedSections((s) => ({ ...s, [group.section]: !s[group.section] }))}
              className="w-full flex items-center justify-between text-[11px] font-bold text-[#949ba4] uppercase tracking-[0.05em] px-2 py-1.5 hover:text-[#f2f3f5] transition-colors"
            >
              {group.section}
              <svg className={`w-[12px] h-[12px] transition-transform ${collapsedSections[group.section] ? "-rotate-90" : ""}`} width={12} height={12} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d={SVG_PATHS.chevron} />
              </svg>
            </button>
            {!collapsedSections[group.section] && (
              <nav className="space-y-0.5">
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => { setTab(item.id); setMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-semibold transition-colors ${
                      tab === item.id
                        ? "bg-[#404249] text-[#f2f3f5]"
                        : "text-[#949ba4] hover:text-[#f2f3f5] hover:bg-[#2b2d31]"
                    }`}
                  >
                    <span className={tab === item.id ? "text-[#5865f2]" : ""}><NavIcon name={item.icon} size={17} /></span>
                    {item.label}
                  </button>
                ))}
              </nav>
            )}
          </div>
        ))}

        {/* ── Back to site ── */}
        <div className="mt-auto pt-4 border-t border-white/[0.06]">
          <button
            onClick={() => navigate({ page: "home" })}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-semibold text-[#949ba4] hover:text-[#f2f3f5] hover:bg-[#2b2d31] transition-colors"
          >
            <NavIcon name="history" size={17} />
            Back to Site
          </button>
        </div>
      </aside>

      {/* ═══ CONTENT AREA ═══ */}
      <div className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
        {/* ── Header with title + refresh + mobile toggle ── */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {/* Mobile menu toggle */}
            <button onClick={() => setMobileMenuOpen((v) => !v)} className="md:hidden p-2 rounded-lg bg-[#232428] border border-white/[0.06]">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="text-2xl font-bold text-[#f2f3f5]">{pageLabel}</h1>
          </div>
          <button
            onClick={refresh}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-white/[0.08] bg-[#2b2d31] text-xs font-bold text-[#949ba4] hover:text-[#f2f3f5] hover:bg-[#404249] transition-colors"
          >
            <NavIcon name="refresh" size={14} />
            Refresh
          </button>
        </div>

        {/* ═══ OVERVIEW PAGE ═══ */}
        {tab === "overview" && (
          <div className="space-y-6">
            {/* Row 1: Primary User Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <StatCard label="Total Users" value={members?.length ?? "—"} icon="users" color="#5865f2" />
              <StatCard label="Active Sessions" value={overview?.onlineNow ?? "—"} icon="pulse" color="#23a559" />
              <StatCard label="New This Week" value={newThisWeek} icon="trending" color="#f59e0b" />
            </div>

            {/* Row 2: Secondary User Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <StatCard label="New This Month" value={newThisMonth} icon="trending" color="#06b6d4" />
              <StatCard label="Admin Users" value={adminUsers} icon="shield" color="#9b59b6" />
              <StatCard label="Banned Users" value={bannedMembers.length} icon="ban" color="#ed4245" />
            </div>

            {/* Content section */}
            <div>
              <SectionLabel>CONTENT</SectionLabel>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                <StatCard label="Total Comments" value={overview?.totalComments ?? "—"} icon="chat" color="#5865f2" />
                <StatCard label="Pending Review" value={0} icon="flag" color="#f59e0b" />
                <StatCard label="Total Views" value={overview?.totalViews ?? "—"} icon="eye" color="#06b6d4" />
                <StatCard label="Collections" value={overview?.totalCollections ?? "—"} icon="bookmark" color="#9b59b6" />
              </div>
            </div>

            {/* Moderation section */}
            <div>
              <SectionLabel>MODERATION</SectionLabel>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                <StatCard label="Pending Reports" value={openReports.length} icon="exclamation" color="#ed4245" />
                <StatCard label="Total Reports" value={reports?.length ?? "—"} icon="flag" color="#f59e0b" />
                <StatCard label="Active Timeouts" value={suspendedMembers.length} icon="clock" color="#f59e0b" />
                <StatCard label="Total Warns" value={warns?.length ?? "—"} icon="exclamation" color="#f59e0b" />
              </div>
            </div>

            {/* ── Recent Activity Summary ── */}
            <div className="rounded-xl border border-white/[0.06] bg-[#1e1f22] p-5">
              <SectionLabel>RECENT MOD ACTIONS</SectionLabel>
              {(logs || []).length === 0 ? (
                <p className="text-sm text-[#949ba4]/60">No recent moderation actions.</p>
              ) : (
                <div className="space-y-2">
                  {(logs || []).slice(0, 5).map((l) => (
                    <div key={l.id} className="flex items-center gap-3 text-sm">
                      <span className="text-[#949ba4]">@{l.actorUsername}</span>
                      <span className="text-[#f2f3f5]">{ACTION_LABEL[l.action] || l.action}</span>
                      <span className="text-[#949ba4]">@{l.targetUsername}</span>
                      {l.reason && <span className="text-[#949ba4]/60 text-xs">— {l.reason}</span>}
                      <span className="text-[#949ba4]/40 text-xs ml-auto">{new Date(l.createdAt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ COMMENTS PAGE ═══ */}
        {tab === "comments" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-white/[0.06] bg-[#1e1f22] p-5">
              <p className="text-[13px] text-[#949ba4] mb-2">Total comments across the site</p>
              <p className="text-[28px] font-bold text-[#f2f3f5] mb-4" style={{ fontFeatureSettings: '"tnum"' }}>{overview?.totalComments ?? "—"}</p>
              <p className="text-sm text-[#949ba4]/60">Per-comment moderation (delete/hide individual comments) is coming soon. This is a live count only.</p>
            </div>
          </div>
        )}

        {/* ═══ REPORTS PAGE ═══ */}
        {tab === "reports" && (
          <ReportsView reports={reports} onResolve={resolveReport} />
        )}

        {/* ═══ WARNS PAGE ═══ */}
        {tab === "warns" && (
          <WarnsView warns={warns} onWarn={warnUser} />
        )}

        {/* ═══ BANS PAGE ═══ */}
        {tab === "bans" && (
          <MembersActionView members={bannedMembers} emptyText="No banned users." onAct={act} showBan />
        )}

        {/* ═══ TIMEOUTS PAGE ═══ */}
        {tab === "timeouts" && (
          <MembersActionView members={suspendedMembers} emptyText="No active timeouts." onAct={act} showSuspend />
        )}

        {/* ═══ USER LOGS PAGE ═══ */}
        {tab === "logs" && (
          <UserLogsView members={members} />
        )}

        {/* ═══ MOD LOGS PAGE ═══ */}
        {tab === "modlogs" && (
          <ModLogsView logs={logs} />
        )}

        {/* ═══ ACTIVITY PAGE ═══ */}
        {tab === "activity" && (
          <div className="space-y-4">
            <StatCard label="Online right now" value={overview?.onlineNow ?? "—"} icon="pulse" color="#23a559" />
            <div className="rounded-xl border border-white/[0.06] bg-[#1e1f22] p-5">
              <SectionLabel>ALL MOD ACTIONS</SectionLabel>
              {(logs || []).length === 0 ? (
                <p className="text-sm text-[#949ba4]/60">No moderation actions logged yet.</p>
              ) : (
                <div className="space-y-2">
                  {(logs || []).map((l) => (
                    <div key={l.id} className="flex items-center gap-3 text-sm">
                      <span className="text-[#949ba4]">@{l.actorUsername}</span>
                      <span className="text-[#f2f3f5]">{ACTION_LABEL[l.action] || l.action}</span>
                      <span className="text-[#949ba4]">@{l.targetUsername}</span>
                      {l.reason && <span className="text-[#949ba4]/60 text-xs">— {l.reason}</span>}
                      <span className="text-[#949ba4]/40 text-xs ml-auto">{new Date(l.createdAt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Sub-Components
// ═══════════════════════════════════════════════════════════════

function ReportsView({ reports, onResolve }: { reports: ReportRow[] | null; onResolve: (id: string, status: "open" | "resolved") => void }) {
  if (reports === null) return <div className="flex items-center justify-center py-16"><div className="w-6 h-6 rounded-full border-2 border-[#949ba4]/30 border-t-[#f2f3f5] animate-spin" /></div>;
  const open = reports.filter((r) => r.status === "open");
  const resolved = reports.filter((r) => r.status === "resolved");
  return (
    <div className="space-y-6">
      <div>
        <SectionLabel>OPEN ({open.length})</SectionLabel>
        {open.length === 0 && <p className="text-sm text-[#949ba4]/60">No open reports. Everything is clean!</p>}
        <div className="space-y-2">
          {open.map((r) => (
            <div key={r.id} className="rounded-xl border border-white/[0.06] bg-[#1e1f22] p-4 flex items-start justify-between gap-3 hover:border-white/[0.10] transition-colors">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${r.kind === "mod" ? "bg-[#5865f2]/15 text-[#5865f2] border-[#5865f2]/20" : "bg-[#949ba4]/10 text-[#949ba4] border-[#949ba4]/20"}`}>
                    {r.kind === "mod" ? "MOD REPORT" : "VIEWER REPORT"}
                  </span>
                  <p className="text-[11px] text-[#949ba4]/60">@{r.byUsername} · {new Date(r.createdAt).toLocaleString()}</p>
                </div>
                <p className="text-sm text-[#f2f3f5]/90">{r.message}</p>
                {r.meta?.animeTitle && <p className="text-xs text-[#949ba4]/40 mt-1">Anime: {r.meta.animeTitle} · Episode {r.meta.episodeNum || "?"}</p>}
              </div>
              <button onClick={() => onResolve(r.id, "resolved")} className="shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-[#f2f3f5] text-[#111214] hover:bg-white transition-colors">Resolve</button>
            </div>
          ))}
        </div>
      </div>
      {resolved.length > 0 && (
        <div>
          <SectionLabel>RESOLVED ({resolved.length})</SectionLabel>
          <div className="space-y-2">
            {resolved.map((r) => (
              <div key={r.id} className="rounded-xl border border-white/[0.04] bg-[#1e1f22] p-4 flex items-start justify-between gap-3 opacity-50">
                <div className="min-w-0">
                  <p className="text-[11px] text-[#949ba4]/40 mb-1">@{r.byUsername} · {new Date(r.createdAt).toLocaleString()}</p>
                  <p className="text-sm text-[#f2f3f5]/70">{r.message}</p>
                </div>
                <button onClick={() => onResolve(r.id, "open")} className="shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-bold border border-white/[0.08] text-[#949ba4] hover:text-[#f2f3f5]">Reopen</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function WarnsView({ warns, onWarn }: { warns: WarnRow[] | null; onWarn: (target: string, reason: string) => Promise<{ ok: boolean; error?: string }> }) {
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!target.trim() || !reason.trim()) return;
    setBusy(true); setErr("");
    const res = await onWarn(target.trim(), reason.trim());
    setBusy(false);
    if (res.ok) { setTarget(""); setReason(""); } else setErr(res.error || "Failed to warn user");
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-white/[0.06] bg-[#1e1f22] p-5">
        <SectionLabel>WARN A USER</SectionLabel>
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Username" className="flex-1 px-3 py-2.5 rounded-lg bg-[#111214] border border-white/[0.06] text-sm text-[#f2f3f5] placeholder-[#949ba4]/60 outline-none focus:border-[#f59e0b]/50 transition-colors" />
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" className="flex-[2] px-3 py-2.5 rounded-lg bg-[#111214] border border-white/[0.06] text-sm text-[#f2f3f5] placeholder-[#949ba4]/60 outline-none focus:border-[#f59e0b]/50 transition-colors" />
          <button onClick={submit} disabled={busy} className="px-4 py-2.5 rounded-lg text-sm font-bold bg-[#f59e0b] text-[#111214] disabled:opacity-50 hover:bg-[#fbbf24] transition-colors">{busy ? "..." : "Warn"}</button>
        </div>
        {err && <p className="text-xs text-[#ed4245] mt-2">{err}</p>}
      </div>

      <div>
        <SectionLabel>WARNINGS ({warns?.length ?? 0})</SectionLabel>
        {warns === null && <div className="flex items-center justify-center py-16"><div className="w-6 h-6 rounded-full border-2 border-[#949ba4]/30 border-t-[#f2f3f5] animate-spin" /></div>}
        {warns !== null && warns.length === 0 && <p className="text-sm text-[#949ba4]/60">No warnings issued yet.</p>}
        <div className="space-y-2">
          {(warns || []).map((w) => (
            <div key={w.id} className="rounded-xl border border-white/[0.06] bg-[#1e1f22] p-4 hover:border-white/[0.10] transition-colors">
              <p className="text-sm text-[#f2f3f5]/90">@{w.username} — {w.reason}</p>
              <p className="text-[11px] text-[#949ba4]/40 mt-1">by @{w.byUsername} · {new Date(w.createdAt).toLocaleString()}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MembersActionView({
  members, emptyText, onAct, showBan, showSuspend,
}: {
  members: ModMember[]; emptyText: string;
  onAct: (target: string, action: "ban" | "unban" | "suspend" | "unsuspend", opts?: { reason?: string; hours?: number }) => Promise<void>;
  showBan?: boolean; showSuspend?: boolean;
}) {
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [hours, setHours] = useState(24);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-white/[0.06] bg-[#1e1f22] p-5">
        <SectionLabel>{showBan ? "BAN A USER" : "SUSPEND A USER"}</SectionLabel>
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Username" className="flex-1 px-3 py-2.5 rounded-lg bg-[#111214] border border-white/[0.06] text-sm text-[#f2f3f5] placeholder-[#949ba4]/60 outline-none focus:border-white/[0.15] transition-colors" />
          {showSuspend && (
            <select value={hours} onChange={(e) => setHours(Number(e.target.value))} className="px-3 py-2.5 rounded-lg bg-[#111214] border border-white/[0.06] text-sm text-[#f2f3f5] outline-none focus:border-white/[0.15]">
              <option value={1}>1 hour</option><option value={24}>24 hours</option><option value={24 * 7}>7 days</option><option value={24 * 30}>30 days</option>
            </select>
          )}
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" className="flex-[2] px-3 py-2.5 rounded-lg bg-[#111214] border border-white/[0.06] text-sm text-[#f2f3f5] placeholder-[#949ba4]/60 outline-none focus:border-white/[0.15] transition-colors" />
          <button
            onClick={async () => { if (!target.trim()) return; await onAct(target.trim(), showBan ? "ban" : "suspend", { reason: reason || undefined, hours }); setTarget(""); setReason(""); }}
            className="px-4 py-2.5 rounded-lg text-sm font-bold transition-colors"
            style={{ backgroundColor: showBan ? "#ed4245" : "#f59e0b", color: showBan ? "#fff" : "#111214" }}
          >{showBan ? "Ban" : "Suspend"}</button>
        </div>
      </div>

      <div>
        {members.length === 0 && <p className="text-sm text-[#949ba4]/60">{emptyText}</p>}
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.username} className="rounded-xl border border-white/[0.06] bg-[#1e1f22] p-4 flex items-center justify-between gap-3 hover:border-white/[0.10] transition-colors">
              <div className="min-w-0 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-[#404249] text-[#f2f3f5]">{m.name.charAt(0).toUpperCase()}</div>
                <div>
                  <p className="font-semibold text-[#f2f3f5]/90 text-sm">{m.name} <span className="text-[#949ba4]/60 font-normal">@{m.username}</span></p>
                  <StatusBadge status={m.status} until={m.until} />
                </div>
              </div>
              <button onClick={() => onAct(m.username, showBan ? "unban" : "unsuspend")} className="shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-bold border border-[#23a559]/20 text-[#23a559] hover:bg-[#23a559]/10 transition-colors">{showBan ? "Unban" : "Lift"}</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function UserLogsView({ members }: { members: ModMember[] | null }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => (members || []).filter((m) => !query.trim() || m.username.toLowerCase().includes(query.toLowerCase()) || m.name.toLowerCase().includes(query.toLowerCase())), [members, query]);

  if (members === null) return <div className="flex items-center justify-center py-16"><div className="w-6 h-6 rounded-full border-2 border-[#949ba4]/30 border-t-[#f2f3f5] animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <SearchInput value={query} onChange={setQuery} placeholder="Search members..." />
      <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
        <table className="w-full text-sm min-w-[520px]">
          <thead><tr className="text-left text-[10px] uppercase tracking-[0.05em] text-[#949ba4] border-b border-white/[0.06] bg-[#1e1f22]">
            <th className="py-3 px-4 font-bold">Member</th><th className="py-3 px-4 font-bold">Joined</th><th className="py-3 px-4 font-bold">Last Seen</th><th className="py-3 px-4 font-bold">Status</th>
          </tr></thead>
          <tbody>{filtered.map((m) => (
            <tr key={m.username} className="border-b border-white/[0.04] hover:bg-[#232428] transition-colors">
              <td className="py-3 px-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold bg-[#404249] text-[#f2f3f5]">{m.name.charAt(0).toUpperCase()}</div>
                  <span className="font-semibold text-[#f2f3f5]">{m.name}</span>
                  <span className="text-[#949ba4]/60">@{m.username}</span>
                  {m.isMod && <span className="ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#5865f2]/15 text-[#5865f2] border border-[#5865f2]/20">MOD</span>}
                  {m.isOwner && <span className="ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#ed4245]/15 text-[#ed4245] border border-[#ed4245]/20">OWNER</span>}
                </div>
              </td>
              <td className="py-3 px-4 text-[#949ba4]/60 whitespace-nowrap">{new Date(m.createdAt).toLocaleDateString()}</td>
              <td className="py-3 px-4 text-[#949ba4]/60 whitespace-nowrap">{m.lastSeen ? new Date(m.lastSeen).toLocaleString() : "—"}</td>
              <td className="py-3 px-4"><StatusBadge status={m.status} until={m.until} /></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

const ACTION_LABEL: Record<string, string> = { ban: "banned", unban: "unbanned", suspend: "suspended", unsuspend: "lifted suspension for", warn: "warned", promote: "promoted", demote: "demoted" };

function ModLogsView({ logs }: { logs: LogRow[] | null }) {
  if (logs === null) return <div className="flex items-center justify-center py-16"><div className="w-6 h-6 rounded-full border-2 border-[#949ba4]/30 border-t-[#f2f3f5] animate-spin" /></div>;
  if (logs.length === 0) return <p className="text-sm text-[#949ba4]/60">No moderation actions logged yet.</p>;
  return (
    <div className="space-y-2">
      {logs.map((l) => (
        <div key={l.id} className="rounded-xl border border-white/[0.06] bg-[#1e1f22] p-4 hover:border-white/[0.10] transition-colors">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-[#5865f2] font-semibold">@{l.actorUsername}</span>
            <span className="text-[#f2f3f5]">{ACTION_LABEL[l.action] || l.action}</span>
            <span className="text-[#949ba4]">@{l.targetUsername}</span>
            {l.reason && <span className="text-[#949ba4]/60 text-xs">— {l.reason}</span>}
            <span className="text-[#949ba4]/40 text-xs ml-auto">{new Date(l.createdAt).toLocaleString()}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
