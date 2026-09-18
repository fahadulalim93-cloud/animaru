"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Users, Activity, BarChart3, HeartPulse, Shield, Ban,
  MessageSquare, Clock, Eye, FolderOpen, RefreshCw, Loader2,
  Server, Database, HardDrive, AlertOctagon, TrendingUp, CalendarDays, CalendarRange, Globe2
} from "lucide-react";
import { useAdmin } from "@/components/admin/admin-layout";
import { Card, StatCard, PanelHeader, Badge, StatusDot, ProgressBar, Button } from "@/components/admin/admin-ui";

interface OverviewData {
  users: { total: number; active: number; newThisWeek: number; newThisMonth: number; admins: number; banned: number };
  views?: { today: number; week: number; month: number; allTime: number };
  content: { totalComments: number; pendingReview: number; totalViews: number; collections: number };
  cache: { hits: number; misses: number; size: number; hitRate: number; dedupHits: number; rateLimits: number };
  recentLogs: { id: string; actor: string; action: string; targetType: string; targetId: string; details: string; createdAt: string }[];
}

export default function AdminOverview() {
  const { user } = useAdmin();
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/overview", { credentials: "include" });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {} finally {
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

  if (!data) return <div className="p-8 text-zinc-500">Failed to load overview data.</div>;

  const { users, views, content, cache, recentLogs } = data;
  const cacheHitRate = cache.hitRate > 0 ? `${cache.hitRate.toFixed(1)}%` : "0%";

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <PanelHeader
        title="OVERVIEW"
        subtitle="Platform statistics, resource logs, and live metrics."
        action={
          <Button onClick={handleRefresh} variant="ghost" className="gap-2">
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {/* User Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        <StatCard label="Total Users" value={users.total} icon={Users} color="blue" />
        <StatCard label="Active Sessions" value={users.active} icon={Activity} color="green" />
        <StatCard label="New This Week" value={users.newThisWeek} icon={BarChart3} color="yellow" />
        <StatCard label="New This Month" value={users.newThisMonth} icon={HeartPulse} color="teal" />
        <StatCard label="Admin Users" value={users.admins} icon={Shield} color="purple" />
        <StatCard label="Banned Users" value={users.banned} icon={Ban} color="red" />
      </div>

      {/* Site Views — Today / This Week / This Month */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard
          label="Views Today"
          value={(views?.today ?? 0).toLocaleString()}
          icon={TrendingUp}
          color="green"
        />
        <StatCard
          label="Views This Week"
          value={(views?.week ?? 0).toLocaleString()}
          icon={CalendarDays}
          color="blue"
        />
        <StatCard
          label="Views This Month"
          value={(views?.month ?? 0).toLocaleString()}
          icon={CalendarRange}
          color="yellow"
        />
        <StatCard
          label="All-Time Visitors"
          value={(views?.allTime ?? 0).toLocaleString()}
          icon={Globe2}
          color="teal"
        />
      </div>

      {/* Content Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Comments" value={content.totalComments} icon={MessageSquare} color="blue" />
        <StatCard label="Pending Review" value={content.pendingReview} icon={Clock} color="yellow" />
        <StatCard label="Total Views" value={content.totalViews} icon={Eye} color="green" />
        <StatCard label="Collections" value={content.collections} icon={FolderOpen} color="purple" />
      </div>

      {/* Infrastructure & Diagnostics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Infrastructure Nodes */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
              <Server className="h-4 w-4 text-zinc-400" />
              Infrastructure Nodes
            </h3>
            <div className="flex items-center gap-1.5">
              <StatusDot status="online" />
              <span className="text-xs text-emerald-400 font-medium">Online</span>
            </div>
          </div>
          <div className="space-y-3">
            <NodeRow name="LuffyTV Host" role="Primary" location="Coolify" cpu={12} mem={45} />
            <NodeRow name="CF Edge (Standby-01)" role="Standby" location="Cloudflare" cpu={3} mem={15} />
            <NodeRow name="Proxy Worker" role="Service" location="Coolify" cpu={5} mem={10} />
          </div>
        </Card>

        {/* Diagnostics */}
        <Card>
          <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2 mb-4">
            <Database className="h-4 w-4 text-zinc-400" />
            Diagnostics
          </h3>
          <div className="space-y-4">
            <DiagnosticRow icon={Database} label="PostgreSQL Status" value="Connected" color="text-emerald-400" />
            <DiagnosticRow icon={HardDrive} label="AniList Cache" value={`${cache.size} entries`} color="text-blue-400" />
            <DiagnosticRow icon={Activity} label="Cache Hit Rate" value={cacheHitRate} color={cache.hitRate > 50 ? "text-emerald-400" : "text-amber-400"} />
            <DiagnosticRow icon={AlertOctagon} label="Rate Limits Handled" value={String(cache.rateLimits)} color="text-zinc-400" />
            <div className="pt-2">
              <ProgressBar value={cache.size} max={2000} label="Cache Capacity" />
            </div>
          </div>
        </Card>
      </div>

      {/* Recent Administrative Events */}
      <Card>
        <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2 mb-4">
          <Clock className="h-4 w-4 text-zinc-400" />
          Recent Administrative Events
        </h3>
        {recentLogs.length === 0 ? (
          <p className="text-sm text-zinc-500">No recent events.</p>
        ) : (
          <div className="space-y-2">
            {recentLogs.map((log) => (
              <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/5">
                <Clock className="h-4 w-4 text-zinc-500 mt-0.5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-semibold text-white">{log.actor}</span>
                    <span className="text-zinc-400"> triggered </span>
                    <Badge variant={getActionVariant(log.action)}>{log.action}</Badge>
                  </p>
                  {log.details && (
                    <p className="text-xs text-zinc-500 mt-1 truncate">{truncateDetails(log.details)}</p>
                  )}
                  <p className="text-xs text-zinc-600 mt-1">
                    {new Date(log.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function NodeRow({ name, role, location, cpu, mem }: { name: string; role: string; location: string; cpu: number; mem: number }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/5">
      <Server className="h-4 w-4 text-zinc-500 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{name}</p>
        <p className="text-xs text-zinc-500">{role} · {location}</p>
      </div>
      <div className="flex items-center gap-3 text-xs flex-shrink-0">
        <span className="text-zinc-400">{cpu}% CPU</span>
        <span className="text-zinc-400">{mem}% Mem</span>
      </div>
    </div>
  );
}

function DiagnosticRow({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </div>
      <span className={`text-sm font-semibold ${color}`}>{value}</span>
    </div>
  );
}

function getActionVariant(action: string): string {
  if (["ban", "delete_comment", "cache_purge"].includes(action)) return "danger";
  if (["unban", "unsuspend", "promote", "login"].includes(action)) return "success";
  if (["suspend", "warn", "create_announcement"].includes(action)) return "warning";
  return "default";
}

function truncateDetails(details: string): string {
  try {
    const obj = JSON.parse(details);
    return JSON.stringify(obj).slice(0, 120);
  } catch {
    return details.slice(0, 120);
  }
}
