"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FRAMES, frameSrcOf } from "./avatar-frames";
import type { HistoryItem } from "./store";

const FONT = "var(--font-space-grotesk), 'Space Grotesk', sans-serif";

interface CharacterGroup {
  title: string;
  characters: { id: number; name: string; image: string }[];
}

function Icon({ path, size = 18 }: { path: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>;
}
const X_ICON = "M18 6 6 18M6 6l12 12";
const UPLOAD_ICON = "M12 16V4m0 0 4 4m-4-4-4 4M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3";
const IMPORT_MAX_BYTES = 3 * 1024 * 1024; // 3MB — keeps the persisted store small

type Tab = "avatar" | "banner" | "frame";

export default function AvatarPickerModal({
  open, onClose, accent, avatarChar, currentAvatarImage, currentBannerImage, currentFrame, history, onApply,
}: {
  open: boolean;
  onClose: () => void;
  accent: string;
  avatarChar: string;
  currentAvatarImage?: string;
  currentBannerImage?: string;
  currentFrame?: string;
  history: HistoryItem[];
  onApply: (patch: { avatarImage?: string | null; bannerImage?: string | null; avatarFrame?: string }) => void;
}) {
  // Portal to document.body — page.tsx's `.content-reveal` mount animation
  // leaves a non-"none" transform/filter on an ancestor even after it
  // finishes, which turns any position:fixed descendant into a scroll-height
  // absolute box instead of a real viewport overlay. Rendering outside that
  // subtree sidesteps it entirely. Guarded by `mounted` since document isn't
  // available during SSR.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [tab, setTab] = useState<Tab>("avatar");
  const [pendingAvatar, setPendingAvatar] = useState<string | null | undefined>(undefined);
  const [pendingBanner, setPendingBanner] = useState<string | null | undefined>(undefined);
  const [pendingFrame, setPendingFrame] = useState<string | undefined>(undefined);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [importError, setImportError] = useState("");

  const [groups, setGroups] = useState<CharacterGroup[]>([]);
  const [loadingChars, setLoadingChars] = useState(false);
  const [banners, setBanners] = useState<string[]>([]);
  const [loadingBanners, setLoadingBanners] = useState(false);

  const avatarFileRef = useRef<HTMLInputElement>(null);
  const bannerFileRef = useRef<HTMLInputElement>(null);

  // Reset staged picks each time the modal opens.
  useEffect(() => {
    if (!open) return;
    setPendingAvatar(undefined);
    setPendingBanner(undefined);
    setPendingFrame(undefined);
    setAvatarUrl(""); setBannerUrl(""); setImportError("");
    setTab("avatar");
  }, [open]);

  // ── Avatar tab: pull character portraits from AniList for the anime the
  //    user has actually watched, grouped by title (like an "unlockable" set). ──
  const uniqueAnimeIds = useMemo(() => {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const h of history) {
      const clean = h.animeId.replace(/^miruro_/, "").replace(/^mal_/, "");
      if (/^\d+$/.test(clean) && !seen.has(clean)) { seen.add(clean); ids.push(clean); }
      if (ids.length >= 8) break;
    }
    return ids;
  }, [history]);

  useEffect(() => {
    if (!open || tab !== "avatar" || groups.length > 0 || loadingChars) return;
    if (uniqueAnimeIds.length === 0) return;
    setLoadingChars(true);
    const query = `query {${uniqueAnimeIds.map((id) => `
      m${id}: Media(id: ${id}, type: ANIME) {
        title { userPreferred }
        characters(perPage: 12, sort: ROLE) { edges { role node { id name { full } image { large medium } } } }
      }`).join("")}
    }`;
    fetch("/api/anilist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    })
      .then((r) => r.json())
      .then((d) => {
        const data = d?.data || {};
        const built: CharacterGroup[] = [];
        for (const key of Object.keys(data)) {
          const media = data[key];
          if (!media) continue;
          const chars = (media.characters?.edges || [])
            .map((e: any) => ({ id: e.node.id, name: e.node.name?.full || "Character", image: e.node.image?.large || e.node.image?.medium }))
            .filter((c: any) => c.image);
          if (chars.length) built.push({ title: media.title?.userPreferred || "Unknown", characters: chars });
        }
        setGroups(built);
      })
      .catch(() => { /* offline / blocked — Import still works */ })
      .finally(() => setLoadingChars(false));
  }, [open, tab, uniqueAnimeIds, groups.length, loadingChars]);

  // ── Banner tab: a handful of trending AniList banners to pick from. ──
  useEffect(() => {
    if (!open || tab !== "banner" || banners.length > 0 || loadingBanners) return;
    setLoadingBanners(true);
    fetch("/api/anilist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "query{Page(perPage:24){media(sort:TRENDING_DESC,type:ANIME,isAdult:false){bannerImage}}}" }),
    })
      .then((r) => r.json())
      .then((d) => {
        const list: string[] = (d?.data?.Page?.media || []).map((m: { bannerImage?: string }) => m.bannerImage).filter(Boolean);
        setBanners(list);
      })
      .catch(() => {})
      .finally(() => setLoadingBanners(false));
  }, [open, tab, banners.length, loadingBanners]);

  if (!open || !mounted) return null;

  const readFile = (file: File, onDone: (dataUrl: string) => void) => {
    setImportError("");
    if (file.size > IMPORT_MAX_BYTES) { setImportError("Image is too large — please use one under 3MB."); return; }
    const reader = new FileReader();
    reader.onload = () => onDone(String(reader.result));
    reader.onerror = () => setImportError("Couldn't read that file.");
    reader.readAsDataURL(file);
  };

  const effectiveAvatar = pendingAvatar !== undefined ? pendingAvatar : (currentAvatarImage || null);
  const effectiveBanner = pendingBanner !== undefined ? pendingBanner : (currentBannerImage || null);
  const effectiveFrame = pendingFrame !== undefined ? pendingFrame : (currentFrame || "none");

  const apply = () => {
    onApply({
      ...(pendingAvatar !== undefined ? { avatarImage: pendingAvatar } : {}),
      ...(pendingBanner !== undefined ? { bannerImage: pendingBanner } : {}),
      ...(pendingFrame !== undefined ? { avatarFrame: pendingFrame } : {}),
    });
    onClose();
  };
  const dirty = pendingAvatar !== undefined || pendingBanner !== undefined || pendingFrame !== undefined;

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: "avatar", label: "Avatar", icon: "M20 21a8 8 0 1 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" },
    { id: "banner", label: "Banner", icon: "M4 4h16v12H4V4zM8 20h8M4 12l4-4 4 4 4-6 4 4" },
    { id: "frame", label: "Frame", icon: "M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z" },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[85vh] rounded-2xl border border-white/10 bg-[#0b0b0f] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.07] shrink-0">
          <h2 className="font-black text-xl" style={{ fontFamily: FONT }}>Customize Profile</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/5 transition-colors"><Icon path={X_ICON} size={18} /></button>
        </div>

        {/* tabs */}
        <div className="flex items-center gap-1 px-6 border-b border-white/[0.07] shrink-0">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className="relative flex items-center gap-2 px-3.5 py-3 text-sm font-bold transition-colors" style={{ color: tab === t.id ? "#fff" : "rgba(255,255,255,0.45)" }}>
              <Icon path={t.icon} size={15} /> {t.label}
              {tab === t.id && <span className="absolute left-0 right-0 -bottom-px h-0.5 rounded-full" style={{ background: accent }} />}
            </button>
          ))}
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* ── AVATAR ── */}
          {tab === "avatar" && (
            <div className="space-y-6">
              {/* import */}
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                <p className="text-xs font-bold text-white/50 uppercase tracking-wide mb-2">Import your own</p>
                <div className="flex gap-2">
                  <input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="Paste an image URL…" className="flex-1 rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2 text-sm outline-none focus:border-white/25" />
                  <button onClick={() => avatarUrl.trim() && setPendingAvatar(avatarUrl.trim())} disabled={!avatarUrl.trim()} className="rounded-lg px-3.5 py-2 text-xs font-bold disabled:opacity-40 shrink-0" style={{ background: accent, color: "#05060a" }}>Use URL</button>
                  <button onClick={() => avatarFileRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 px-3.5 py-2 text-xs font-bold hover:bg-white/5 transition-colors shrink-0"><Icon path={UPLOAD_ICON} size={13} /> Upload</button>
                  <input ref={avatarFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f, setPendingAvatar); e.target.value = ""; }} />
                </div>
                {importError && <p className="text-xs text-red-400 mt-2">{importError}</p>}
              </div>

              {effectiveAvatar && (
                <button onClick={() => setPendingAvatar(null)} className="text-xs font-bold text-white/50 hover:text-white transition-colors">← Remove custom avatar, use the letter instead</button>
              )}

              {/* character portraits, grouped by anime */}
              {uniqueAnimeIds.length === 0 ? (
                <p className="text-white/35 text-sm py-6 text-center">Watch some anime and character portraits from your history will show up here.</p>
              ) : loadingChars ? (
                <p className="text-white/35 text-sm py-6 text-center">Loading characters from your watch history…</p>
              ) : groups.length === 0 ? (
                <p className="text-white/35 text-sm py-6 text-center">Couldn't load character art right now — Import still works.</p>
              ) : (
                groups.map((g) => (
                  <div key={g.title}>
                    <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-2.5">{g.title} — {g.characters.length}</p>
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2.5">
                      {g.characters.map((c) => {
                        const active = effectiveAvatar === c.image;
                        return (
                          <button key={c.id} onClick={() => setPendingAvatar(c.image)} title={c.name} className="relative aspect-square rounded-full overflow-hidden border-2 transition-transform hover:scale-105" style={{ borderColor: active ? accent : "transparent" }}>
                            <img src={c.image} alt={c.name} className="w-full h-full object-cover" />
                            {active && <span className="absolute inset-0 ring-2 ring-inset rounded-full" style={{ boxShadow: `inset 0 0 0 2px ${accent}` }} />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── BANNER ── */}
          {tab === "banner" && (
            <div className="space-y-6">
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                <p className="text-xs font-bold text-white/50 uppercase tracking-wide mb-2">Import your own</p>
                <div className="flex gap-2">
                  <input value={bannerUrl} onChange={(e) => setBannerUrl(e.target.value)} placeholder="Paste an image URL…" className="flex-1 rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2 text-sm outline-none focus:border-white/25" />
                  <button onClick={() => bannerUrl.trim() && setPendingBanner(bannerUrl.trim())} disabled={!bannerUrl.trim()} className="rounded-lg px-3.5 py-2 text-xs font-bold disabled:opacity-40 shrink-0" style={{ background: accent, color: "#05060a" }}>Use URL</button>
                  <button onClick={() => bannerFileRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 px-3.5 py-2 text-xs font-bold hover:bg-white/5 transition-colors shrink-0"><Icon path={UPLOAD_ICON} size={13} /> Upload</button>
                  <input ref={bannerFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f, setPendingBanner); e.target.value = ""; }} />
                </div>
                {importError && <p className="text-xs text-red-400 mt-2">{importError}</p>}
              </div>

              {effectiveBanner && (
                <button onClick={() => setPendingBanner(null)} className="text-xs font-bold text-white/50 hover:text-white transition-colors">← Remove custom banner, use a random one each visit</button>
              )}

              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-2.5">Trending Now</p>
                {loadingBanners ? (
                  <p className="text-white/35 text-sm py-6 text-center">Loading banners…</p>
                ) : banners.length === 0 ? (
                  <p className="text-white/35 text-sm py-6 text-center">Couldn't load banners right now — Import still works.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2.5">
                    {banners.map((b, i) => {
                      const active = effectiveBanner === b;
                      return (
                        <button key={i} onClick={() => setPendingBanner(b)} className="relative aspect-[16/9] rounded-lg overflow-hidden border-2 transition-transform hover:scale-[1.02]" style={{ borderColor: active ? accent : "transparent" }}>
                          <img src={b} alt="" className="w-full h-full object-cover" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── FRAME ── */}
          {tab === "frame" && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {FRAMES.map((f) => {
                const active = effectiveFrame === f.key;
                return (
                  <button key={f.key} onClick={() => setPendingFrame(f.key)} className="rounded-2xl border p-3 flex flex-col items-center gap-2 transition-colors" style={{ borderColor: active ? accent : "rgba(255,255,255,0.08)", background: active ? `${accent}0f` : "transparent" }}>
                    <div className="relative w-16 h-16">
                      <div className="w-full h-full rounded-full flex items-center justify-center text-xl font-black border-2 overflow-hidden transition-shadow" style={{ background: `${accent}33`, color: accent, borderColor: "#08080c" }}>
                        {effectiveAvatar ? <img src={effectiveAvatar} alt="" className="w-full h-full object-cover" /> : avatarChar}
                      </div>
                      {f.src && <img src={f.thumb || f.src} alt="" aria-hidden loading="lazy" decoding="async" className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[128%] h-[128%] max-w-none" />}
                    </div>
                    <span className="text-xs font-semibold text-center">{f.name}</span>
                    {active && <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${accent}22`, color: accent }}>Equipped</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/[0.07] shrink-0">
          <button onClick={onClose} className="rounded-lg border border-white/12 px-5 py-2.5 text-sm font-bold hover:bg-white/5 transition-colors">Cancel</button>
          <button onClick={apply} disabled={!dirty} className="rounded-lg px-5 py-2.5 text-sm font-bold disabled:opacity-40 transition-colors" style={{ background: accent, color: "#05060a" }}>Apply Changes</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
