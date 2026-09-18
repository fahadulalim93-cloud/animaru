"use client";

import React, { useState, useEffect } from "react";
import { Search, Save, Loader2 } from "lucide-react";
import { Card, PanelHeader, Button } from "@/components/admin/admin-ui";
import { loadSeo, saveSeo, DEFAULT_SEO, type SeoSettings } from "@/lib/seo-config";

export default function SeoPage() {
  const [seo, setSeo] = useState<SeoSettings>(DEFAULT_SEO);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try { const s = await loadSeo(); if (s) setSeo(s); } catch {} finally { setLoading(false); }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try { await saveSeo(seo); } catch {} finally { setSaving(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin text-violet-400" /></div>;

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      <PanelHeader
        title="SEO CONFIG"
        subtitle="Search engine optimization settings and Open Graph metadata."
        action={<Button onClick={handleSave} variant="primary" disabled={saving} className="gap-2"><Save className="h-4 w-4" />{saving ? "Saving..." : "Save"}</Button>}
      />

      <Card className="space-y-4">
        <Field label="Site Title" value={seo.title} onChange={(v) => setSeo({ ...seo, title: v })} />
        <Field label="Description" value={seo.description} onChange={(v) => setSeo({ ...seo, description: v })} textarea />
        <Field label="Keywords" value={seo.keywords} onChange={(v) => setSeo({ ...seo, keywords: v })} />
        <Field label="OG Image URL" value={seo.ogImage || ""} onChange={(v) => setSeo({ ...seo, ogImage: v })} />
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wider">Robots</label>
          <select
            value={seo.robots || "index, follow"}
            onChange={(e) => setSeo({ ...seo, robots: e.target.value })}
            className="w-full px-4 py-2 rounded-lg bg-[#0a0a0a] border border-white/10 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
          >
            <option value="index, follow">Index, Follow</option>
            <option value="noindex, follow">No Index, Follow</option>
            <option value="index, nofollow">Index, No Follow</option>
            <option value="noindex, nofollow">No Index, No Follow</option>
          </select>
        </div>
      </Card>
    </div>
  );
}

function Field({ label, value, onChange, textarea }: { label: string; value: string; onChange: (v: string) => void; textarea?: boolean }) {
  const cls = "w-full px-4 py-2 rounded-lg bg-[#0a0a0a] border border-white/10 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50";
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wider">{label}</label>
      {textarea ? <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className={`${cls} resize-none`} /> : <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className={cls} />}
    </div>
  );
}
