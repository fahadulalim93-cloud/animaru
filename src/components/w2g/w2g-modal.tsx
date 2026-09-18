"use client";

import { useState, useEffect } from "react";
import { useAppStore } from "@/components/anime/store";

interface Props {
  animeId: number;
  episodeNum: number;
  animeTitle: string;
  animeImage: string | null;
}

export function W2GModal({ animeId, episodeNum, animeTitle, animeImage }: Props) {
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);

  // Check auth — try zustand first, then localStorage directly
  useEffect(() => {
    let attempts = 0;
    const checkAuth = () => {
      attempts++;
      // Method 1: Check zustand store
      const storeUser = useAppStore.getState().user;
      if (storeUser) { setIsLoggedIn(true); return; }

      // Method 2: Check localStorage directly (zustand persist stores here)
      try {
        const raw = localStorage.getItem("luffytv-store");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.state?.user) {
            // User exists in localStorage but zustand hasn't hydrated yet
            // Wait and retry
            if (attempts < 5) { setTimeout(checkAuth, 100); return; }
            // After 5 attempts, trust localStorage
            setIsLoggedIn(true);
            return;
          }
        }
      } catch {}

      // Method 3: Check for session cookie
      if (typeof document !== "undefined") {
        const cookies = document.cookie;
        if (cookies.includes("luffytv_user_session")) {
          if (attempts < 5) { setTimeout(checkAuth, 100); return; }
          setIsLoggedIn(true);
          return;
        }
      }

      // Not logged in
      setIsLoggedIn(false);
    };
    // Start after 100ms
    const t = setTimeout(checkAuth, 100);
    return () => clearTimeout(t);
  }, []);

  if (!open) return null;

  const close = () => { setOpen(false); setError(""); setLoading(false); };

  const createRoom = async () => {
    // Get username from localStorage (zustand persist)
    let username = "";
    try {
      const raw = localStorage.getItem("luffytv-store");
      if (raw) {
        const parsed = JSON.parse(raw);
        username = parsed?.state?.user?.username || "";
      }
    } catch {}
    if (!username) { setError("login"); return; }

    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/w2g/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          animeId: Number(animeId),
          episodeNum: Number(episodeNum),
          animeTitle: animeTitle || `Anime ${animeId}`,
          visibility,
          hostUsername: username,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) setError("login");
        else setError(data.error || "Failed");
        setLoading(false);
        return;
      }
      window.location.href = `/w2g/${data.room.code}`;
    } catch (err: any) {
      setError(err.message || "Failed");
      setLoading(false);
    }
  };

  // Loading state while checking auth
  if (isLoggedIn === null) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4" onClick={close}>
        <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-black p-8 shadow-2xl" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-center">
            <svg className="w-6 h-6 animate-spin text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          </div>
        </div>
      </div>
    );
  }

  const showLogin = error === "login" || isLoggedIn === false;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4" onClick={close}>
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-black shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800/80">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            <h2 className="text-sm font-bold text-white">Watch Together</h2>
          </div>
          {!loading && (
            <button onClick={close} className="text-zinc-500 hover:text-white transition-colors">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
        </div>

        <div className="p-5 space-y-4">
          {/* Anime preview */}
          <div className="flex items-center gap-3 rounded-xl bg-zinc-900/80 p-2.5 border border-zinc-800/60">
            {animeImage && <img src={animeImage} alt="" className="w-10 h-14 rounded-lg object-cover" />}
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate text-white">{animeTitle || `Anime ${animeId}`}</p>
              <p className="text-[11px] text-zinc-500">Episode {episodeNum}</p>
            </div>
          </div>

          {/* Not logged in */}
          {showLogin ? (
            <div className="space-y-3">
              <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-4 text-center">
                <svg className="w-7 h-7 mx-auto mb-2 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <p className="text-sm text-amber-200/90">Please log in to make a Watch Together room.</p>
              </div>
              <a href={`/login?next=/watch/${animeId}/${episodeNum}`} className="block w-full h-10 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm flex items-center justify-center transition-colors">Log In</a>
              <button onClick={close} className="w-full text-xs text-zinc-600 hover:text-zinc-400 transition-colors">Cancel</button>
            </div>
          ) : error ? (
            <div className="space-y-3">
              <div className="rounded-xl bg-red-500/5 border border-red-500/20 p-3 text-center">
                <p className="text-sm text-red-400">{error}</p>
              </div>
              <button onClick={() => { setError(""); }} className="w-full h-10 rounded-xl bg-zinc-900 border border-zinc-800 text-sm font-semibold text-zinc-300 hover:text-white transition-colors">Try Again</button>
            </div>
          ) : (
            <>
              {/* Room type */}
              <div>
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Room Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setVisibility("public")} className={`rounded-xl p-3 border transition-all ${visibility === "public" ? "border-amber-500/50 bg-amber-500/10" : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"}`}>
                    <div className="flex items-center gap-2 mb-0.5">
                      <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${visibility === "public" ? "border-amber-500" : "border-zinc-600"}`}>
                        {visibility === "public" && <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                      </div>
                      <span className="font-bold text-sm text-white">Public</span>
                    </div>
                    <p className="text-[10px] text-zinc-500 pl-5">Open to everyone</p>
                  </button>
                  <button onClick={() => setVisibility("private")} className={`rounded-xl p-3 border transition-all ${visibility === "private" ? "border-amber-500/50 bg-amber-500/10" : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"}`}>
                    <div className="flex items-center gap-2 mb-0.5">
                      <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${visibility === "private" ? "border-amber-500" : "border-zinc-600"}`}>
                        {visibility === "private" && <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                      </div>
                      <span className="font-bold text-sm text-white">Private</span>
                    </div>
                    <p className="text-[10px] text-zinc-500 pl-5">Link required</p>
                  </button>
                </div>
              </div>

              {/* Features */}
              <div className="grid grid-cols-2 gap-1.5 text-[10px] text-zinc-500">
                <div className="flex items-center gap-1"><span className="text-amber-500">✓</span> Synced playback</div>
                <div className="flex items-center gap-1"><span className="text-amber-500">✓</span> Real-time chat</div>
                <div className="flex items-center gap-1"><span className="text-amber-500">✓</span> Multiple viewers</div>
                <div className="flex items-center gap-1"><span className="text-amber-500">✓</span> Host controls</div>
              </div>

              {/* Create button */}
              <button onClick={createRoom} disabled={loading} className="w-full h-11 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold text-sm flex items-center justify-center gap-2 transition-colors">
                {loading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                    Creating...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M5 12h14"/></svg>
                    CREATE ROOM
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
