"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Video, Users, UserSearch, AlertTriangle, ScrollText,
  Trash2, Megaphone, Search, BarChart3, Globe2, Settings, LogOut, ChevronDown,
  Shield, Activity, RefreshCw, Loader2, Trophy, Radio
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────
interface AdminUser {
  id: string;
  username: string;
  displayName: string | null;
  role: string;
  avatarUrl: string | null;
}

interface AdminContextValue {
  user: AdminUser | null;
  loading: boolean;
  refresh: () => void;
}

export const AdminContext = createContext<AdminContextValue>({ user: null, loading: true, refresh: () => {} });
export const useAdmin = () => useContext(AdminContext);

// ── Navigation config ────────────────────────────────────────────────────
const NAV = [
  { group: "GENERAL", items: [
    { href: "/admin", icon: LayoutDashboard, label: "Overview" },
    { href: "/admin/content", icon: Video, label: "Content" },
  ]},
  { group: "MODERATION", items: [
    { href: "/admin/users", icon: Users, label: "Users Control" },
    { href: "/admin/user-xp", icon: Trophy, label: "User XP & Profiles" },
    { href: "/admin/users-inspect", icon: UserSearch, label: "Data Inspector" },
    { href: "/admin/reports", icon: AlertTriangle, label: "Reports Queue" },
  ]},
  { group: "SYSTEM", items: [
    { href: "/admin/logs", icon: ScrollText, label: "System Logs" },
    { href: "/admin/cache", icon: Trash2, label: "Cache Purger" },
    { href: "/admin/announcements", icon: Megaphone, label: "Announcements" },
  ]},
  { group: "ANALYTICS", items: [
    { href: "/admin/live", icon: Radio, label: "Live Watching" },
    { href: "/admin/seo", icon: Search, label: "SEO Config" },
    { href: "/admin/audience", icon: Globe2, label: "Audience" },
  ]},
  { group: "CONFIG", items: [
    { href: "/admin/settings", icon: Settings, label: "Settings" },
  ]},
];

// ── Role badge colors ────────────────────────────────────────────────────
const ROLE_COLORS: Record<string, string> = {
  owner: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  admin: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  mod: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

// ── Admin Layout ─────────────────────────────────────────────────────────
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/me", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMe(); }, [fetchMe]);

  // Redirect to login if not authenticated (and not already on login page)
  useEffect(() => {
    if (!loading && !user && pathname !== "/admin/login") {
      window.location.href = "/admin/login";
    }
  }, [loading, user, pathname]);

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST", credentials: "include" });
    setUser(null);
    window.location.href = "/admin/login";
  };

  // Login page gets no sidebar
  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0a0a0a]">
        <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <AdminContext.Provider value={{ user, loading, refresh: fetchMe }}>
      <div className="flex h-screen bg-[#0a0a0a] text-white overflow-hidden">
        {/* Sidebar */}
        <aside className={`${collapsed ? "w-16" : "w-60"} flex-shrink-0 border-r border-white/5 bg-[#0d0d0d] flex flex-col transition-all duration-200`}>
          {/* User info */}
          <div className={`p-4 border-b border-white/5 ${collapsed ? "items-center" : ""}`}>
            <div className={`flex items-center gap-3 ${collapsed ? "justify-center" : ""}`}>
              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-sm font-bold flex-shrink-0">
                {(user.displayName || user.username).charAt(0).toUpperCase()}
              </div>
              {!collapsed && (
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{user.displayName || user.username}</p>
                  <span className={`inline-block mt-0.5 px-2 py-0 text-[10px] font-bold uppercase rounded border ${ROLE_COLORS[user.role] || ROLE_COLORS.admin}`}>
                    {user.role}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Nav groups */}
          <nav className="flex-1 overflow-y-auto py-2 scrollbar-thin">
            {NAV.map((group) => (
              <div key={group.group} className="mb-3">
                {!collapsed && (
                  <p className="px-4 mb-1 text-[10px] font-bold tracking-widest text-zinc-500 uppercase">
                    {group.group}
                  </p>
                )}
                {group.items.map((item) => {
                  const active = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-3 mx-2 px-2 py-2 rounded-lg text-sm font-medium transition-colors
                        ${active ? "bg-violet-500/15 text-violet-400" : "text-zinc-400 hover:text-white hover:bg-white/5"}
                        ${collapsed ? "justify-center" : ""}
                      `}
                      title={collapsed ? item.label : undefined}
                    >
                      <item.icon className={`h-4 w-4 flex-shrink-0 ${active ? "text-violet-400" : ""}`} />
                      {!collapsed && <span>{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* Bottom actions */}
          <div className="p-2 border-t border-white/5">
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="flex items-center gap-3 w-full px-2 py-2 rounded-lg text-sm text-zinc-500 hover:text-white hover:bg-white/5 transition-colors"
            >
              <ChevronDown className={`h-4 w-4 transition-transform ${collapsed ? "" : "-rotate-90"}`} />
              {!collapsed && <span>Collapse</span>}
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-2 py-2 rounded-lg text-sm text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              {!collapsed && <span>Logout</span>}
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </AdminContext.Provider>
  );
}
