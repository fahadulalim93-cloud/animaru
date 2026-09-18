"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

export function CreateRoomForm() {
  const router = useRouter();
  const [animeId, setAnimeId] = useState("");
  const [episodeNum, setEpisodeNum] = useState("1");
  const [animeTitle, setAnimeTitle] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("animeId")) setAnimeId(params.get("animeId")!);
    if (params.get("episode")) setEpisodeNum(params.get("episode")!);
    if (params.get("title")) setAnimeTitle(params.get("title")!);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!animeId || !animeTitle) { setError("Anime ID and title are required."); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/w2g/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ animeId: parseInt(animeId), episodeNum: parseInt(episodeNum) || 1, animeTitle, visibility }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create room");
      router.push(`/w2g/${data.room.code}`);
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs text-muted-foreground mb-1">AniList ID</label>
        <input type="number" value={animeId} onChange={(e) => setAnimeId(e.target.value)} placeholder="e.g. 130298" className="w-full h-9 px-3 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Anime Title</label>
        <input type="text" value={animeTitle} onChange={(e) => setAnimeTitle(e.target.value)} placeholder="e.g. The Eminence in Shadow" className="w-full h-9 px-3 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Episode</label>
        <input type="number" value={episodeNum} onChange={(e) => setEpisodeNum(e.target.value)} className="w-full h-9 px-3 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => setVisibility("public")} className={`flex-1 h-9 rounded-lg text-sm font-semibold transition-colors ${visibility === "public" ? "bg-amber-500 text-black" : "bg-background border border-border text-muted-foreground hover:text-foreground"}`}>Public</button>
        <button type="button" onClick={() => setVisibility("private")} className={`flex-1 h-9 rounded-lg text-sm font-semibold transition-colors ${visibility === "private" ? "bg-amber-500 text-black" : "bg-background border border-border text-muted-foreground hover:text-foreground"}`}>Private</button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button type="submit" disabled={loading} className="w-full h-10 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold text-sm transition-colors">{loading ? "Creating..." : "Create Room"}</button>
    </form>
  );
}

export function JoinByCodeForm({ isLoggedIn }: { isLoggedIn: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = code.trim().toUpperCase();
    if (cleaned.length !== 6) { setError("Room code must be 6 characters."); return; }
    if (!isLoggedIn) { router.push(`/login?next=/w2g/${cleaned}`); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/w2g/rooms/${cleaned}`);
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || "Room not found"); }
      router.push(`/w2g/${cleaned}`);
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input type="text" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6} placeholder="K7X9PQ" className="w-full h-12 px-3 rounded-lg bg-background border border-border text-center text-xl font-mono tracking-widest font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button type="submit" disabled={loading || code.length !== 6} className="w-full h-10 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold text-sm transition-colors">{loading ? "Joining..." : isLoggedIn ? "Join Room" : "Log In to Join"}</button>
    </form>
  );
}

interface PublicRoom { id: string; code: string; animeId: number; episodeNum: number; animeTitle: string; animeImage: string | null; memberCount: number; host: { username: string }; }

export function PublicRoomsList({ isLoggedIn }: { isLoggedIn: boolean }) {
  const router = useRouter();
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRooms = useCallback(async () => {
    try { const res = await fetch("/api/w2g/rooms"); const data = await res.json(); setRooms(data.rooms || []); } catch { setRooms([]); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRooms(); const interval = setInterval(fetchRooms, 15000); return () => clearInterval(interval); }, [fetchRooms]);

  const handleJoin = (code: string) => { if (!isLoggedIn) { router.push(`/login?next=/w2g/${code}`); return; } router.push(`/w2g/${code}`); };

  if (loading) return (<div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{[1, 2, 3].map((i) => (<div key={i} className="h-32 rounded-xl bg-card border border-border animate-pulse" />))}</div>);
  if (rooms.length === 0) return (<div className="rounded-xl border border-dashed border-border p-8 text-center"><p className="text-sm text-muted-foreground">No public rooms right now. Create one to get the party started!</p></div>);

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {rooms.map((room) => (
        <div key={room.id} className="group rounded-xl border border-border bg-card overflow-hidden hover:border-amber-500/40 transition-colors">
          {room.animeImage && (
            <div className="relative h-24 overflow-hidden">
              <img src={room.animeImage} alt={room.animeTitle} className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity" />
              <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/70 text-xs font-bold text-white">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
                {room.memberCount}
              </div>
            </div>
          )}
          <div className="p-3">
            <h3 className="font-bold text-sm truncate">{room.animeTitle}</h3>
            <p className="text-xs text-muted-foreground mb-2">Episode {room.episodeNum} · Host: {room.host.username}</p>
            <button onClick={() => handleJoin(room.code)} className="w-full h-8 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 font-semibold text-xs transition-colors">Join</button>
          </div>
        </div>
      ))}
    </div>
  );
}
