"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Megaphone, Plus, Trash2, RefreshCw, Loader2, X } from "lucide-react";
import { Card, PanelHeader, Badge, Button, EmptyState } from "@/components/admin/admin-ui";

interface Announcement { id: string; title: string; message: string; type: string; createdAt: number; expiry: number | null; active: boolean; }

export default function AnnouncementsPage() {
  const [anns, setAnns] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState("info");
  const [submitting, setSubmitting] = useState(false);

  const fetchAnns = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/announcements", { credentials: "include" });
      if (res.ok) { const data = await res.json(); setAnns(data.announcements || []); }
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAnns(); }, [fetchAnns]);

  const handleCreate = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "create", title, message, type }),
      });
      if (res.ok) {
        setTitle(""); setMessage(""); setType("info"); setShowCreate(false);
        fetchAnns();
      }
    } catch {} finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    await fetch("/api/admin/announcements", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "delete", id }),
    });
    fetchAnns();
  };

  const typeVariant = (t: string) => t === "warning" ? "warning" : t === "update" ? "info" : "success";

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin text-violet-400" /></div>;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <PanelHeader
        title="ANNOUNCEMENTS"
        subtitle={`${anns.length} active announcements.`}
        action={
          <div className="flex gap-2">
            <Button onClick={() => { setLoading(true); fetchAnns(); }} variant="ghost" className="gap-2">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button onClick={() => setShowCreate(true)} variant="primary" className="gap-2">
              <Plus className="h-4 w-4" /> New
            </Button>
          </div>
        }
      />

      {/* Create form */}
      {showCreate && (
        <Card className="mb-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold uppercase tracking-wider">Create Announcement</h3>
            <button onClick={() => setShowCreate(false)} className="text-zinc-500 hover:text-white"><X className="h-4 w-4" /></button>
          </div>
          <div className="space-y-3">
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="w-full px-4 py-2 rounded-lg bg-[#0a0a0a] border border-white/10 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50" />
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Message..." rows={3} className="w-full px-4 py-2 rounded-lg bg-[#0a0a0a] border border-white/10 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50 resize-none" />
            <div className="flex items-center gap-2">
              {["info", "warning", "update"].map((t) => (
                <button key={t} onClick={() => setType(t)} className={`px-3 py-1 rounded-lg text-xs font-medium ${type === t ? "bg-violet-500/20 text-violet-400" : "bg-zinc-800 text-zinc-400"}`}>
                  {t}
                </button>
              ))}
            </div>
            <Button onClick={handleCreate} variant="primary" disabled={!title || !message || submitting} className="gap-2">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {submitting ? "Creating..." : "Create"}
            </Button>
          </div>
        </Card>
      )}

      {/* List */}
      {anns.length === 0 ? (
        <EmptyState icon={Megaphone} message="No announcements" />
      ) : (
        <div className="space-y-3">
          {anns.map((a) => (
            <Card key={a.id} className="flex items-start gap-4">
              <Megaphone className="h-5 w-5 text-zinc-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-sm font-semibold">{a.title}</h4>
                  <Badge variant={typeVariant(a.type)}>{a.type}</Badge>
                </div>
                <p className="text-sm text-zinc-400">{a.message}</p>
                <p className="text-xs text-zinc-600 mt-2">{new Date(a.createdAt).toLocaleString()}</p>
              </div>
              <button onClick={() => handleDelete(a.id)} className="p-1.5 rounded hover:bg-red-500/10 text-zinc-500 hover:text-red-400 flex-shrink-0">
                <Trash2 className="h-4 w-4" />
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
