"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AlertTriangle, CheckCircle, Loader2, RefreshCw } from "lucide-react";
import { Card, PanelHeader, Badge, Button, Table, EmptyState } from "@/components/admin/admin-ui";

interface Report { id: string; kind: string; byUsername: string; byName: string; message: string; meta: any; createdAt: number; status: string; }

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchReports = useCallback(async () => {
    try {
      const res = await fetch("/api/mod/reports", { credentials: "include" });
      if (res.ok) { const data = await res.json(); setReports(data.reports || []); }
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const resolveReport = async (id: string) => {
    await fetch("/api/mod/reports", { method: "POST", headers: { "content-type": "application/json" }, credentials: "include", body: JSON.stringify({ id, action: "resolve" }) });
    fetchReports();
  };

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin text-violet-400" /></div>;

  const open = reports.filter((r) => r.status === "open");
  const resolved = reports.filter((r) => r.status === "resolved");

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <PanelHeader
        title="REPORTS QUEUE"
        subtitle={`${open.length} open · ${resolved.length} resolved`}
        action={
          <Button onClick={() => { setLoading(true); fetchReports(); }} variant="ghost" className="gap-2">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
      />

      <Card className="p-0 overflow-hidden">
        {reports.length === 0 ? (
          <EmptyState icon={AlertTriangle} message="No reports" />
        ) : (
          <Table
            headers={["Type", "Reporter", "Message", "Time", "Status", "Action"]}
            rows={reports.map((r) => [
              <Badge key="t" variant={r.kind === "mod" ? "purple" : "warning"}>{r.kind}</Badge>,
              <span key="by" className="text-sm">{r.byName || r.byUsername}</span>,
              <span key="msg" className="text-xs text-zinc-400 truncate max-w-[200px] block">{r.message?.slice(0, 80)}</span>,
              <span key="time" className="text-xs text-zinc-500">{new Date(r.createdAt).toLocaleString()}</span>,
              <Badge key="s" variant={r.status === "open" ? "warning" : "success"}>{r.status}</Badge>,
              r.status === "open" ? (
                <button key="act" onClick={() => resolveReport(r.id)} className="p-1.5 rounded hover:bg-emerald-500/10 text-emerald-400" title="Resolve">
                  <CheckCircle className="h-3.5 w-3.5" />
                </button>
              ) : <span key="act" />,
            ])}
          />
        )}
      </Card>
    </div>
  );
}
