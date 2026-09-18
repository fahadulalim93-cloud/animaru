"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Trash2, Activity, RefreshCw, Loader2, CheckCircle } from "lucide-react";
import { Card, PanelHeader, Badge, Button, ProgressBar, EmptyState } from "@/components/admin/admin-ui";

interface CacheData { ok: boolean; hits: number; misses: number; size: number; hitRate: number; dedupHits: number; rateLimits: number; purged?: string; }

export default function CachePage() {
  const [data, setData] = useState<CacheData | null>(null);
  const [loading, setLoading] = useState(true);
  const [purging, setPurging] = useState(false);
  const [purged, setPurged] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/cache", { credentials: "include" });
      if (res.ok) setData(await res.json());
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handlePurge = async (target: string) => {
    setPurging(true);
    setPurged(false);
    try {
      const res = await fetch("/api/admin/cache", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ target }),
      });
      if (res.ok) {
        const result = await res.json();
        setData(result);
        setPurged(true);
        setTimeout(() => setPurged(false), 3000);
      }
    } catch {} finally { setPurging(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin text-violet-400" /></div>;
  if (!data) return <div className="p-8 text-zinc-500">Failed to load cache data.</div>;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <PanelHeader
        title="CACHE PURGER"
        subtitle="AniList query cache management and statistics."
        action={
          <Button onClick={() => { setLoading(true); fetchData(); }} variant="ghost" className="gap-2">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
      />

      {/* Cache Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card className="text-center">
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Cache Size</p>
          <p className="text-3xl font-bold mt-2">{data.size}</p>
          <p className="text-xs text-zinc-500 mt-1">/ 2,000 entries</p>
        </Card>
        <Card className="text-center">
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Hit Rate</p>
          <p className={`text-3xl font-bold mt-2 ${data.hitRate > 50 ? "text-emerald-400" : "text-amber-400"}`}>
            {data.hitRate.toFixed(1)}%
          </p>
        </Card>
        <Card className="text-center">
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Dedup Hits</p>
          <p className="text-3xl font-bold mt-2 text-blue-400">{data.dedupHits}</p>
        </Card>
        <Card className="text-center">
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Rate Limits</p>
          <p className="text-3xl font-bold mt-2 text-zinc-300">{data.rateLimits}</p>
        </Card>
      </div>

      {/* Capacity */}
      <Card className="mb-6">
        <h3 className="text-sm font-bold uppercase tracking-wider mb-4">Cache Capacity</h3>
        <ProgressBar value={data.size} max={2000} label="Entries" />
        <div className="grid grid-cols-3 gap-4 mt-4">
          <div>
            <p className="text-xs text-zinc-500">Hits</p>
            <p className="text-lg font-semibold text-emerald-400">{data.hits.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Misses</p>
            <p className="text-lg font-semibold text-amber-400">{data.misses.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Dedup Saves</p>
            <p className="text-lg font-semibold text-blue-400">{data.dedupHits.toLocaleString()}</p>
          </div>
        </div>
      </Card>

      {/* Purge Actions */}
      <Card>
        <h3 className="text-sm font-bold uppercase tracking-wider mb-4">Purge Actions</h3>
        <div className="flex items-center gap-3">
          <Button
            variant="danger"
            onClick={() => handlePurge("anilist")}
            disabled={purging}
            className="gap-2"
          >
            {purging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Purge AniList Cache
          </Button>
          <Button
            variant="danger"
            onClick={() => handlePurge("all")}
            disabled={purging}
            className="gap-2"
          >
            <Trash2 className="h-4 w-4" />
            Purge All Caches
          </Button>
          {purged && (
            <span className="flex items-center gap-1 text-sm text-emerald-400">
              <CheckCircle className="h-4 w-4" /> Cache purged successfully
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}
