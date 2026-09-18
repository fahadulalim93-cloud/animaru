"use client";

import React, { useState } from "react";
import { Settings, Save, Download, AlertTriangle, Loader2, Palette } from "lucide-react";
import { useAdmin } from "@/components/admin/admin-layout";
import { Card, PanelHeader, Badge, Button } from "@/components/admin/admin-ui";

export default function SettingsPage() {
  const { user } = useAdmin();
  const [accentColor, setAccentColor] = useState("#8b5cf6");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const [overview, members] = await Promise.all([
        fetch("/api/admin/overview", { credentials: "include" }).then((r) => r.ok ? r.json() : null),
        fetch("/api/admin/moderation", { credentials: "include" }).then((r) => r.ok ? r.json() : null),
      ]);
      const blob = new Blob([JSON.stringify({ overview, members }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `luffytv-export-${Date.now()}.json`; a.click();
      URL.revokeObjectURL(url);
    } catch {} finally { setExporting(false); }
  };

  const handleResetAnalytics = async () => {
    if (!confirm("Reset all analytics data? This cannot be undone.")) return;
    // Would call an API to reset analytics
  };

  const handleClearMembers = async () => {
    if (!confirm("Clear all member data? This cannot be undone.")) return;
    // Would call an API to clear members
  };

  const colors = ["#8b5cf6", "#6366f1", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#f97316"];

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      <PanelHeader title="SETTINGS" subtitle="Admin panel configuration and data management." />

      {/* Accent Color */}
      <Card className="mb-4">
        <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2 mb-4">
          <Palette className="h-4 w-4 text-zinc-400" />
          Accent Color
        </h3>
        <div className="flex items-center gap-2">
          {colors.map((c) => (
            <button
              key={c}
              onClick={() => setAccentColor(c)}
              className={`h-8 w-8 rounded-lg border-2 transition-all ${accentColor === c ? "border-white scale-110" : "border-transparent hover:border-white/30"}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </Card>

      {/* Data Export */}
      <Card className="mb-4">
        <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2 mb-4">
          <Download className="h-4 w-4 text-zinc-400" />
          Data Export
        </h3>
        <p className="text-sm text-zinc-400 mb-3">Export all admin data as a JSON file for backup or migration.</p>
        <Button onClick={handleExport} disabled={exporting} className="gap-2">
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {exporting ? "Exporting..." : "Export JSON"}
        </Button>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-500/20">
        <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2 mb-4 text-red-400">
          <AlertTriangle className="h-4 w-4" />
          Danger Zone
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-lg bg-red-500/5 border border-red-500/10">
            <div>
              <p className="text-sm font-medium">Reset Analytics</p>
              <p className="text-xs text-zinc-500">Clear all traffic and visitor data.</p>
            </div>
            <Button variant="danger" size="sm" onClick={handleResetAnalytics}>Reset</Button>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-red-500/5 border border-red-500/10">
            <div>
              <p className="text-sm font-medium">Clear Member Directory</p>
              <p className="text-xs text-zinc-500">Remove all member entries and moderation data.</p>
            </div>
            <Button variant="danger" size="sm" onClick={handleClearMembers}>Clear</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
