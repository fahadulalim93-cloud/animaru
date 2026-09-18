"use client";

import React, { useState, useEffect, useCallback } from "react";
import { ScrollText, Filter, Loader2, RefreshCw } from "lucide-react";
import { Card, PanelHeader, Badge, Button, Table, EmptyState } from "@/components/admin/admin-ui";

interface AuditEntry { id: string; actor: string; actorUsername: string; action: string; targetType: string; targetId: string; details: string; ip: string; createdAt: string; }

const ACTION_COLORS: Record<string, string> = {
  ban: "danger", unban: "success", suspend: "warning", unsuspend: "success",
  promote: "purple", demote: "default", warn: "warning",
  cache_purge: "danger", login: "info", logout: "default",
  create_announcement: "info", delete_announcement: "danger",
  settings_change: "warning", edit_comment: "default", delete_comment: "danger",
};

export default function LogsPage() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("");

  const fetchLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (filter) params.set("action", filter);
      const res = await fetch(`/api/admin/audit-logs?${params}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        setTotal(data.total || 0);
      }
    } catch {} finally { setLoading(false); }
  }, [page, filter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin text-violet-400" /></div>;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <PanelHeader
        title="SYSTEM LOGS"
        subtitle={`${total} total audit entries. Immutable record of all administrative actions.`}
        action={
          <Button onClick={() => { setLoading(true); fetchLogs(); }} variant="ghost" className="gap-2">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
      />

      {/* Filter */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Filter className="h-4 w-4 text-zinc-500" />
        {["", "ban", "unban", "suspend", "promote", "cache_purge", "login", "create_announcement"].map((action) => (
          <button
            key={action}
            onClick={() => { setFilter(action); setPage(1); setLoading(true); }}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${filter === action ? "bg-violet-500/20 text-violet-400" : "bg-zinc-800 text-zinc-400 hover:text-white"}`}
          >
            {action || "All"}
          </button>
        ))}
      </div>

      <Card className="p-0 overflow-hidden">
        {logs.length === 0 ? (
          <EmptyState icon={ScrollText} message="No audit logs found" />
        ) : (
          <Table
            headers={["Time", "Actor", "Action", "Target", "IP", "Details"]}
            rows={logs.map((l) => [
              <span key="t" className="text-xs text-zinc-500 whitespace-nowrap">{new Date(l.createdAt).toLocaleString()}</span>,
              <span key="a" className="text-sm font-medium">{l.actor}</span>,
              <Badge key="act" variant={ACTION_COLORS[l.action] || "default"}>{l.action}</Badge>,
              <span key="tgt" className="text-xs text-zinc-400">{l.targetId || "-"}</span>,
              <span key="ip" className="text-xs text-zinc-500 font-mono">{l.ip || "-"}</span>,
              <span key="d" className="text-xs text-zinc-500 truncate max-w-[200px] block">{l.details ? truncate(l.details) : "-"}</span>,
            ])}
          />
        )}
      </Card>

      {/* Pagination */}
      {total > 50 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-zinc-500">Page {page} of {Math.ceil(total / 50)}</p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setPage(Math.max(1, page - 1)); setLoading(true); }} disabled={page === 1}>Prev</Button>
            <Button variant="ghost" size="sm" onClick={() => { setPage(page + 1); setLoading(true); }} disabled={page * 50 >= total}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function truncate(s: string): string {
  try { return JSON.stringify(JSON.parse(s)).slice(0, 100); } catch { return s.slice(0, 100); }
}
