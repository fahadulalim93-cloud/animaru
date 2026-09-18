"use client";

import React, { useState, useEffect } from "react";
import { BarChart3, Loader2 } from "lucide-react";
import { Card, PanelHeader, Badge, Table, EmptyState, StatCard } from "@/components/admin/admin-ui";
import { Users, Eye, MessageSquare, Globe2 } from "lucide-react";

interface AnalyticsData {
  kvEnabled: boolean; range: number; totalViews: number; totalSessions: number;
  uniqueVisitors: number; onlineNow: number; signupsTotal: number;
  topPaths: { path: string; count: number }[];
  referrers: { source: string; count: number }[];
  countries: { code: string; count: number }[];
  devices: { name: string; count: number }[];
}

export default function AudiencePage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/analytics/stats?days=14", { credentials: "include" });
        if (res.ok) setData(await res.json());
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin text-violet-400" /></div>;
  if (!data) return <div className="p-8 text-zinc-500">Failed to load analytics.</div>;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <PanelHeader title="AUDIENCE" subtitle="Traffic, referrers, countries, and device breakdown." />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Views" value={data.totalViews.toLocaleString()} icon={Eye} color="green" />
        <StatCard label="Sessions" value={data.totalSessions.toLocaleString()} icon={Users} color="blue" />
        <StatCard label="Unique Visitors" value={data.uniqueVisitors.toLocaleString()} icon={Globe2} color="teal" />
        <StatCard label="Online Now" value={data.onlineNow} icon={BarChart3} color="purple" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Pages */}
        <Card className="p-0 overflow-hidden">
          <div className="p-4 border-b border-white/5">
            <h3 className="text-sm font-bold uppercase tracking-wider">Top Pages</h3>
          </div>
          {data.topPaths.length === 0 ? <EmptyState icon={BarChart3} message="No data" /> : (
            <Table headers={["Path", "Views"]} rows={data.topPaths.map((p) => [<span key="p" className="text-sm font-mono text-zinc-300">{p.path}</span>, <span key="c" className="text-sm text-zinc-400">{p.count.toLocaleString()}</span>])} />
          )}
        </Card>

        {/* Countries */}
        <Card className="p-0 overflow-hidden">
          <div className="p-4 border-b border-white/5">
            <h3 className="text-sm font-bold uppercase tracking-wider">Countries</h3>
          </div>
          {data.countries.length === 0 ? <EmptyState icon={Globe2} message="No data" /> : (
            <Table headers={["Country", "Visitors"]} rows={data.countries.map((c) => [<span key="c" className="text-sm">{c.code}</span>, <span key="v" className="text-sm text-zinc-400">{c.count.toLocaleString()}</span>])} />
          )}
        </Card>

        {/* Referrers */}
        <Card className="p-0 overflow-hidden">
          <div className="p-4 border-b border-white/5">
            <h3 className="text-sm font-bold uppercase tracking-wider">Traffic Sources</h3>
          </div>
          {data.referrers.length === 0 ? <EmptyState icon={BarChart3} message="No data" /> : (
            <Table headers={["Source", "Visits"]} rows={data.referrers.map((r) => [<span key="s" className="text-sm">{r.source}</span>, <span key="c" className="text-sm text-zinc-400">{r.count.toLocaleString()}</span>])} />
          )}
        </Card>

        {/* Devices */}
        <Card className="p-0 overflow-hidden">
          <div className="p-4 border-b border-white/5">
            <h3 className="text-sm font-bold uppercase tracking-wider">Devices</h3>
          </div>
          {data.devices.length === 0 ? <EmptyState icon={BarChart3} message="No data" /> : (
            <Table headers={["Device", "Count"]} rows={data.devices.map((d) => [<span key="n" className="text-sm">{d.name}</span>, <span key="c" className="text-sm text-zinc-400">{d.count.toLocaleString()}</span>])} />
          )}
        </Card>
      </div>
    </div>
  );
}
