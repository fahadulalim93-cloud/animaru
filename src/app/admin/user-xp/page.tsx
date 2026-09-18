"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Trophy, Loader2, RefreshCw, Search, Star, Eye, Play, BookOpen, Calendar } from "lucide-react";
import { Card, PanelHeader, Badge, Table, EmptyState, Button, StatCard } from "@/components/admin/admin-ui";

interface AdminUser {
  id: string;
  username: string;
  email: string | null;
  name: string | null;
  xp: number;
  level: number;
  watchCount: number;
  episodeCount: number;
  commentCount: number;
  bookmarkCount: number;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  _count?: { sessions: number; progress: number };
}

interface Stats {
  totalUsers: number;
  totalXp: number;
  totalWatchCount: number;
  totalEpisodeCount: number;
  avgLevel: number;
}

interface UsersResponse {
  ok: boolean;
  users: AdminUser[];
  total: number;
  page: number;
  limit: number;
  stats: Stats;
}

type SortKey = "xp" | "level" | "watchCount" | "episodeCount" | "createdAt";

export default function UserXpPage() {
  const [data, setData] = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("xp");

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users?limit=200", { credentials: "include" });
      if (res.ok) setData(await res.json());
    } catch (e) {
      console.error("[admin/user-xp] fetch failed:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRefresh = () => { setRefreshing(true); fetchData(); };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
      </div>
    );
  }

  if (!data) return <div className="p-8 text-zinc-500">Failed to load user data.</div>;

  // Filter + sort client-side (data is already paginated to 200)
  const q = search.trim().toLowerCase();
  const filtered = data.users.filter((u) => {
    if (!q) return true;
    return (
      u.username.toLowerCase().includes(q) ||
      (u.email || "").toLowerCase().includes(q) ||
      (u.name || "").toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q)
    );
  });
  filtered.sort((a, b) => (b[sortBy] as number) - (a[sortBy] as number));

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <PanelHeader
        title="USER XP & PROFILES"
        subtitle="Every registered user — ID, XP, level, watch stats. Sort and search to find anyone."
        action={
          <Button onClick={handleRefresh} variant="ghost" className="gap-2">
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <StatCard label="Total Users" value={data.stats.totalUsers} icon={Trophy} color="blue" />
        <StatCard label="Total XP" value={data.stats.totalXp.toLocaleString()} icon={Star} color="yellow" />
        <StatCard label="Avg Level" value={data.stats.avgLevel} icon={Star} color="purple" />
        <StatCard label="Total Watch Count" value={data.stats.totalWatchCount.toLocaleString()} icon={Eye} color="green" />
        <StatCard label="Total Episode Views" value={data.stats.totalEpisodeCount.toLocaleString()} icon={Play} color="teal" />
      </div>

      {/* Search + Sort */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by username, name, email, or ID..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-[#111] border border-white/10 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 uppercase tracking-wider">Sort by</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="px-3 py-2.5 rounded-lg bg-[#111] border border-white/10 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
          >
            <option value="xp">XP (highest)</option>
            <option value="level">Level (highest)</option>
            <option value="watchCount">Watch Count</option>
            <option value="episodeCount">Episodes Watched</option>
            <option value="createdAt">Newest</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <Card className="p-0 overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState icon={Trophy} message="No users found" />
        ) : (
          <Table
            headers={["User", "ID", "Level", "XP", "Watch Stats", "Activity", "Status"]}
            rows={filtered.map((u) => [
              <div key="user" className="min-w-0">
                <p className="font-medium text-sm truncate">
                  {u.name || u.username}
                </p>
                <p className="text-xs text-zinc-500">@{u.username}</p>
                {u.email && <p className="text-xs text-zinc-600 truncate">{u.email}</p>}
              </div>,
              <div key="id" className="text-xs font-mono text-zinc-500 max-w-[140px] truncate" title={u.id}>
                {u.id}
              </div>,
              <div key="level">
                <Badge variant="purple">Lv {u.level}</Badge>
              </div>,
              <div key="xp" className="text-sm font-semibold text-yellow-400">
                {u.xp.toLocaleString()} XP
              </div>,
              <div key="watch" className="text-xs text-zinc-400 space-y-1">
                <div className="flex items-center gap-1.5">
                  <Eye className="h-3 w-3" />
                  <span>{u.watchCount} anime</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Play className="h-3 w-3" />
                  <span>{u.episodeCount} eps</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <BookOpen className="h-3 w-3" />
                  <span>{u.bookmarkCount} bookmarks</span>
                </div>
              </div>,
              <div key="activity" className="text-xs text-zinc-500 space-y-1">
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3 w-3" />
                  <span>Joined {new Date(u.createdAt).toLocaleDateString()}</span>
                </div>
                {u.lastLoginAt && (
                  <div>Last seen {new Date(u.lastLoginAt).toLocaleDateString()}</div>
                )}
                {u._count && (
                  <div className="text-zinc-600">{u._count.progress} anime in progress</div>
                )}
              </div>,
              <div key="status">
                {u.active
                  ? <Badge variant="success">Active</Badge>
                  : <Badge variant="danger">Banned</Badge>}
              </div>,
            ])}
          />
        )}
      </Card>

      {/* Footer count */}
      <div className="mt-4 text-center text-xs text-zinc-500">
        Showing {filtered.length} of {data.total} registered users
      </div>
    </div>
  );
}
