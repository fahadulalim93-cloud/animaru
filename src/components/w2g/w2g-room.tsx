"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { W2GClient } from "@/lib/w2g-client";
import { wrapM3u8UrlSameDomain } from "@/lib/proxy";

// HLSPlayerNew is a heavy client component — load it dynamically so the
// W2G room page doesn't pull the full hls.js bundle on first paint.
const HLSPlayerNew = dynamic(() => import("@/components/anime/hls-player-new"), { ssr: false });

interface SubtitleTrack { url: string; lang: string; label: string; }
interface SkipTime { start: number; end: number; }
interface Server {
  id: string; name: string;
  streamUrl: string; isM3U8: boolean; isEmbed: boolean;
  source: string; type: string;
  megaplayFileId?: string;
  megaplayAudio?: "sub" | "dub";
  subtitleTracks?: SubtitleTrack[];
  intro?: SkipTime | null;
  outro?: SkipTime | null;
  referer?: string;
}
interface Member { id: string; username: string; isHost: boolean; muted: boolean; }
interface RoomState { playing: boolean; currentTime: number; updatedAt: number; episodeNum: number; }
interface ChatMessage { username: string; text: string; emoji?: string | null; ts: number; }

interface Props { roomCode: string; animeId: number; episodeNum: number; animeTitle: string; animeImage: string | null; }

const REACTIONS = ["🔥", "❤️", "😂", "😮", "👑", "🎉"];

export function W2GRoomClient({ roomCode, animeId, episodeNum, animeTitle, animeImage }: Props) {
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [isHost, setIsHost] = useState(false);
  const [state, setState] = useState<RoomState>({ playing: false, currentTime: 0, updatedAt: Date.now(), episodeNum });
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [showShareModal, setShowShareModal] = useState(false);
  const [showEpisodeModal, setShowEpisodeModal] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [episodeCount, setEpisodeCount] = useState<number>(12); // fallback if AniList fails
  const [synced, setSynced] = useState(true);
  const [servers, setServers] = useState<Server[]>([]);
  const [selectedServer, setSelectedServer] = useState<string>("");
  const [streamLoading, setStreamLoading] = useState(true);
  const [streamError, setStreamError] = useState("");
  const wsRef = useRef<W2GClient | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null); // set via HLSPlayerNew onVideoElement callback
  const chatScrollRef = useRef<HTMLDivElement>(null);
  // myUsername MUST be useState (not useRef) so that the WS effect re-runs
  // when the username loads from localStorage. With useRef, ref mutations
  // don't trigger re-renders, so the WS effect's deps `[myUsername.current]`
  // never changes from React's POV — and the host's isHost flag never gets
  // set, causing the JOIN PLAYBACK overlay to flash on the host's own screen.
  const [myUsername, setMyUsername] = useState<string>("");
  const lastHostUpdateTime = useRef<number>(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("luffytv-store");
      if (raw) {
        const parsed = JSON.parse(raw);
        const u = parsed?.state?.user?.username;
        if (u && u !== "guest") setMyUsername(u);
      }
    } catch {}
  }, []);

  // Fetch servers for this anime/episode
  const fetchServers = useCallback(async (epNum: number) => {
    setStreamLoading(true);
    setStreamError("");
    const allServers: Server[] = [];
    // Source order — anibd first (raw m3u8, fastest proxy path), then
    // anidao + anineko-to (api.luffytv.live pre-wrapped), then anikoto
    // (Inazuma / megaplay — brings subtitles + intro/outro skip times).
    const sources = [
      { api: `/api/anime/anibd-servers/${animeId}/${epNum}`, label: "anibd" },
      { api: `/api/anime/anidao-servers/${animeId}/${epNum}?title=${encodeURIComponent(animeTitle)}`, label: "anidao" },
      { api: `/api/anime/anineko-to-servers/${animeId}/${epNum}`, label: "anineko-to" },
      { api: `/api/anime/anikoto-servers/${animeId}/${epNum}?title=${encodeURIComponent(animeTitle)}`, label: "anikoto" },
    ];
    for (const src of sources) {
      try {
        const res = await fetch(src.api);
        if (res.ok) {
          const data = await res.json();
          for (const s of (data.servers || [])) {
            if (s.streamUrl && s.isM3U8 && !s.isEmbed) {
              // Route through same-domain /p/{token} proxy (Next.js route,
              // fastest — reuses HTTP/2 connection from page load).
              // wrapM3u8UrlSameDomain passes through already-wrapped URLs
              // (workers.dev / api.luffytv.live) unchanged.
              // For anikoto megaplayFileId servers, streamUrl may be empty —
              // HLSPlayerNew resolves megaplay client-side via the fileId.
              const finalUrl = s.megaplayFileId ? (s.streamUrl || "") : wrapM3u8UrlSameDomain(s.streamUrl);
              allServers.push({
                id: s.id || `${src.label}-${allServers.length}`,
                name: s.name || s.id,
                streamUrl: finalUrl,
                isM3U8: true,
                isEmbed: false,
                source: s.source || src.label,
                type: s.type || "sub",
                megaplayFileId: s.megaplayFileId,
                megaplayAudio: s.megaplayAudio,
                subtitleTracks: s.subtitleTracks,
                intro: s.intro,
                outro: s.outro,
              });
            }
          }
        }
      } catch {}
    }
    setServers(allServers);
    if (allServers.length > 0) {
      const first = allServers[0];
      setSelectedServer(first.id);
      // HLSPlayerNew handles stream loading internally — we just set the
      // `currentServer` state which drives its props.
      setCurrentServer(first);
      setStreamLoading(false);
    } else {
      setStreamError("No streams found. Try another episode.");
      setStreamLoading(false);
    }
  }, [animeId, animeTitle]);

  // HLSPlayerNew handles stream loading internally — no manual loadStream needed.
  // Stream URL + megaplayFileId are passed as props; the player rebuilds itself
  // when currentServer changes.
  const [currentServer, setCurrentServer] = useState<Server | null>(null);

  useEffect(() => { fetchServers(episodeNum); }, [episodeNum, fetchServers]);

  // Fetch real episode count from AniList (server-side) so the EPISODES modal
  // shows the correct number of buttons instead of hardcoded 24.
  useEffect(() => {
    fetch(`/api/anime/info?id=${animeId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const n = data?.episodes;
        if (typeof n === "number" && n > 0) setEpisodeCount(Math.min(n, 200));
      })
      .catch(() => {});
  }, [animeId]);

  // WebSocket
  useEffect(() => {
    if (!myUsername) return;
    const client = new W2GClient(roomCode, myUsername);
    wsRef.current = client;
    client.on("connected", () => setConnected(true));
    client.on("disconnected", () => setConnected(false));
    client.on("room_state", (data: any) => {
      setMembers(data.members || []);
      setState(data.state || state);
      const me = (data.members || []).find((m: Member) => m.username === myUsername);
      if (me) setIsHost(me.isHost);
    });
    client.on("chat", (msg: ChatMessage) => setChat((prev) => [...prev, msg].slice(-100)));
    client.on("state_update", (newState: RoomState) => {
      setState(newState);
      const video = videoRef.current;
      if (video) {
        const elapsed = (Date.now() - newState.updatedAt) / 1000;
        const expected = newState.playing ? newState.currentTime + elapsed : newState.currentTime;
        if (Math.abs(video.currentTime - expected) > 2) video.currentTime = expected;
        if (newState.playing && video.paused) video.play().catch(()=>{});
        else if (!newState.playing && !video.paused) video.pause();
      }
    });
    client.on("member_join", (data: any) => {
      setMembers((prev) => prev.some((m) => m.username === data.username) ? prev : [...prev, { id: data.username, username: data.username, isHost: data.isHost, muted: false }]);
    });
    client.on("member_leave", (data: any) => setMembers((prev) => prev.filter((m) => m.username !== data.username)));
    client.on("voice_mute", (data: any) => {
      // Server sends { username, muted } — match by username, not userId
      const targetUsername = data.username || data.userId;
      setMembers((prev) => prev.map((m) => m.username === targetUsername ? { ...m, muted: data.muted } : m));
    });
    client.on("room_closed", () => router.push("/w2g"));
    client.on("kicked", () => { setTimeout(() => router.push("/w2g"), 2000); });
    client.connect();
    return () => { client.disconnect(); };
  }, [myUsername, roomCode]);

  const broadcastState = useCallback(() => {
    if (!isHost || !wsRef.current) return;
    const video = videoRef.current;
    if (!video) return;
    const now = Date.now();
    if (now - lastHostUpdateTime.current < 1000) return;
    lastHostUpdateTime.current = now;
    wsRef.current.sendStateUpdate({ playing: !video.paused, currentTime: video.currentTime, episodeNum: state.episodeNum });
  }, [isHost, state.episodeNum]);

  // Attach our own listeners to the video element exposed by HLSPlayerNew.
  // The player owns its own UI (controls, subtitles, quality, etc.) — we
  // only listen for play/pause/seek/timeupdate to broadcast state to other
  // W2G peers (host) and detect sync drift (viewer).
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onPlay = () => broadcastState();
    const onPause = () => broadcastState();
    const onSeeked = () => broadcastState();
    const onTimeUpdate = () => {
      if (isHost) {
        broadcastState();
      } else {
        const elapsed = (Date.now() - state.updatedAt) / 1000;
        const expected = state.playing ? state.currentTime + elapsed : state.currentTime;
        setSynced(Math.abs(video.currentTime - expected) < 5);
      }
    };
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("timeupdate", onTimeUpdate);
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("timeupdate", onTimeUpdate);
    };
  }, [isHost, state.updatedAt, state.currentTime, state.playing, broadcastState, currentServer]);

  useEffect(() => { chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" }); }, [chat]);

  const syncToHost = () => {
    wsRef.current?.requestSync();
    const video = videoRef.current;
    if (video && state) {
      const elapsed = (Date.now() - state.updatedAt) / 1000;
      const expected = state.playing ? state.currentTime + elapsed : state.currentTime;
      video.currentTime = expected;
      if (state.playing) video.play().catch(()=>{}); else video.pause();
      setSynced(true);
    }
  };

  const sendChat = (e: React.FormEvent) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text || !wsRef.current) return;
    wsRef.current.sendChat(text);
    setChatInput("");
  };

  const sendReaction = (emoji: string) => {
    if (wsRef.current) wsRef.current.sendChat(emoji, emoji);
  };

  const changeServer = (serverId: string) => {
    setSelectedServer(serverId);
    const srv = servers.find(s => s.id === serverId);
    if (srv) {
      // HLSPlayerNew handles loading — setting currentServer triggers a fresh
      // hls.js instance with the new URL / megaplayFileId.
      setStreamLoading(true);
      setStreamError("");
      setCurrentServer(srv);
    }
  };

  const closeRoom = async () => {
    if (!isHost) return;
    await fetch(`/api/w2g/rooms/${roomCode}?action=close`, { method: "DELETE" });
    router.push("/w2g");
  };

  const leaveRoom = () => { wsRef.current?.disconnect(); router.push("/w2g"); };
  const shareLink = typeof window !== "undefined" ? `${window.location.origin}/w2g/${roomCode}` : "";
  const copyLink = () => { navigator.clipboard.writeText(shareLink).then(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); }); };

  // While we're still loading the username from localStorage, show a minimal
  // loading state instead of the room UI. This prevents the host from briefly
  // seeing the JOIN PLAYBACK overlay before WS connects and isHost flips true.
  if (!myUsername) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black text-zinc-400">
        <div className="flex flex-col items-center gap-3">
          <svg className="w-8 h-8 animate-spin text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          <p className="text-xs">Connecting to room…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Top bar — clean breadcrumb + connection dot */}
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 bg-zinc-950 shrink-0">
        <div className="flex items-center gap-2 min-w-0 text-xs text-zinc-500">
          <a href="/" className="hover:text-white transition-colors">Home</a>
          <span>/</span>
          <a href="/w2g" className="hover:text-white transition-colors">Lobbies</a>
          <span>/</span>
          <span className="text-white font-semibold">Watch Party</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isHost && (
            <div className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-xs font-bold text-yellow-400">
              <span>👑</span>
              <span>You're the host</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 px-2 h-7 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-bold">
            <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
            <span className="text-zinc-400">{members.length}</span>
          </div>
        </div>
      </header>

      {/* Main */}
      <div className="flex-1 flex min-h-0">
        {/* Left: video + action buttons */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Video player — capped at 60vh so action row + chat input are always visible */}
          <div className="relative bg-black w-full shrink-0" style={{ maxHeight: "60vh", aspectRatio: "16 / 9" }}>
            {currentServer && (
              <HLSPlayerNew
                key={currentServer.id}
                url={currentServer.streamUrl}
                animeId={String(animeId)}
                episodeNum={episodeNum}
                animeTitle={animeTitle}
                sourceType="hls"
                autoplay
                intro={currentServer.intro || null}
                outro={currentServer.outro || null}
                subtitleTracks={currentServer.subtitleTracks}
                megaplayFileId={currentServer.megaplayFileId}
                megaplayAudio={currentServer.megaplayAudio}
                onVideoElement={(v) => { videoRef.current = v; }}
                onCanPlay={() => setStreamLoading(false)}
                onProviderFailed={() => {
                  setStreamError("Stream failed. Try another server.");
                  setStreamLoading(false);
                }}
              />
            )}
            {/* Sync indicator — only show once WS has delivered room_state (members.length > 0 means we know who's host). Before that, hiding it avoids a false "Out of sync" flash. */}
            {!isHost && members.length > 0 && (
              <div className="absolute top-2 left-2 z-30 flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/70 text-xs font-bold pointer-events-none">
                <span className={`w-2 h-2 rounded-full ${synced ? "bg-green-500" : "bg-amber-500"}`} />
                <span className={synced ? "text-green-400" : "text-amber-400"}>{synced ? "Synced" : "Out of sync"}</span>
              </div>
            )}
            {/* Loading */}
            {streamLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-40 pointer-events-none">
                <svg className="w-8 h-8 animate-spin text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              </div>
            )}
            {/* Error */}
            {streamError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-40 pointer-events-none">
                <p className="text-red-400 text-sm">{streamError}</p>
              </div>
            )}
            {/* JOIN PLAYBACK — only show for confirmed non-host viewers (WS delivered room_state and we found ourselves in members with isHost=false). Hosts never see this. */}
            {!isHost && members.length > 0 && !synced && !streamLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-40">
                <button onClick={syncToHost} className="px-6 py-3 rounded-xl bg-green-500 hover:bg-green-400 text-black font-bold flex items-center gap-2 transition-colors">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  <div className="text-left"><div>JOIN PLAYBACK</div><div className="text-xs font-normal opacity-70">Sync with host</div></div>
                </button>
              </div>
            )}
          </div>

          {/* Action row: title + EPISODES + SHARE + END/LEAVE + server dropdown */}
          <div className="border-t border-zinc-800 p-3 flex items-center gap-2 bg-zinc-950 shrink-0 flex-wrap">
            <div className="min-w-0 flex-1">
              <h2 className="font-bold text-sm truncate text-white">{animeTitle}</h2>
              <p className="text-xs text-zinc-500">Episode {state.episodeNum} · {servers.length} servers available</p>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {/* EPISODES button — opens modal with episode grid */}
              <button
                onClick={() => setShowEpisodeModal(true)}
                className="h-8 px-3 rounded-lg bg-green-500 hover:bg-green-400 text-black text-xs font-bold flex items-center gap-1.5 transition-colors"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                EPISODES
              </button>
              {/* SHARE button */}
              <button onClick={() => setShowShareModal(true)} className="h-8 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-bold transition-colors">Share</button>
              {/* END / LEAVE button */}
              {isHost ? (
                <button onClick={closeRoom} className="h-8 px-3 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-400 text-xs font-bold transition-colors">End</button>
              ) : (
                <button onClick={leaveRoom} className="h-8 px-3 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-400 text-xs font-bold transition-colors">Leave</button>
              )}
              {/* Server dropdown — collapses below on narrow screens */}
              {servers.length > 0 && (
                <select
                  value={selectedServer}
                  onChange={(e) => changeServer(e.target.value)}
                  className="h-8 px-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-bold text-zinc-300 focus:outline-none focus:ring-1 focus:ring-amber-500/30 max-w-[180px]"
                >
                  {servers.map(s => (
                    <option key={s.id} value={s.id}>Server: {s.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Spacer — fills remaining vertical space with empty dark bg */}
          <div className="flex-1 bg-zinc-950 min-h-0" />
        </div>

        {/* Right: Chat */}
        <div className="w-72 sm:w-80 flex flex-col border-l border-zinc-800 bg-zinc-950 shrink-0 min-h-0">
          {/* User list */}
          <div className="px-3 py-2 border-b border-zinc-800 max-h-28 overflow-y-auto shrink-0">
            <div className="space-y-1">
              {members.map((m) => (
                <div key={m.username} className="flex items-center gap-2 text-xs group">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 bg-zinc-800 text-zinc-400">{m.username[0]?.toUpperCase()}</div>
                  <span className={`truncate flex-1 ${m.username === myUsername ? "text-amber-400" : "text-zinc-400"}`}>
                    {m.username}{m.isHost && <span className="ml-1 text-yellow-500">👑</span>}
                  </span>
                  {m.muted && <span className="text-red-400/60 text-[10px]">🔇</span>}
                  {isHost && m.username !== myUsername && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => wsRef.current?.muteUser(m.username, true)} className="text-zinc-500 hover:text-red-400" title="Mute">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/></svg>
                      </button>
                      <button onClick={() => wsRef.current?.kickUser(m.username)} className="text-zinc-500 hover:text-red-400" title="Kick">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="18" y1="8" x2="23" y2="13"/><line x1="23" y1="8" x2="18" y2="13"/></svg>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Chat header */}
          <div className="px-4 py-2 border-b border-zinc-800 flex items-center justify-between shrink-0">
            <span className="text-xs font-bold text-amber-400">CHAT</span>
            <span className="text-[10px] text-zinc-500">{members.length} viewers</span>
          </div>

          {/* Chat messages */}
          <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 text-sm min-h-0">
            {chat.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center gap-2 text-zinc-700">
                <p className="text-xs">It's a ghost town in here.<br />Be the first to say something!</p>
              </div>
            ) : (
              chat.map((msg, i) => (
                <div key={i} className="flex flex-col">
                  <span className="text-[10px] text-zinc-600">{msg.username} · {new Date(msg.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  {msg.emoji && msg.text === msg.emoji ? <span className="text-2xl">{msg.emoji}</span> : <span className="text-zinc-200">{msg.text}</span>}
                </div>
              ))
            )}
          </div>

          {/* Reactions */}
          <div className="px-3 py-1.5 border-t border-zinc-800 flex items-center gap-1 shrink-0">
            <span className="text-[10px] text-zinc-600 font-bold mr-1">REACT:</span>
            {REACTIONS.map(emoji => <button key={emoji} onClick={() => sendReaction(emoji)} className="w-7 h-7 rounded hover:bg-zinc-800 flex items-center justify-center text-base transition-colors hover:scale-125">{emoji}</button>)}
          </div>

          {/* Chat input */}
          <form onSubmit={sendChat} className="border-t border-zinc-800 p-2 flex gap-1 shrink-0">
            <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="TRANSMIT MESSAGE..." maxLength={500} className="flex-1 h-9 px-3 rounded-lg bg-zinc-900 border border-zinc-800 text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-amber-500/30 text-white" />
            <button type="submit" disabled={!chatInput.trim()} className="h-9 w-9 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-30 text-black flex items-center justify-center transition-colors">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg>
            </button>
          </form>
        </div>
      </div>

      {/* Share modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" onClick={() => setShowShareModal(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-black p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold mb-1 text-white">Share Room Link</h3>
            <p className="text-xs text-zinc-500 mb-3">Anyone with this link can join the room.</p>
            <div className="flex gap-2">
              <input type="text" value={shareLink} readOnly className="flex-1 h-10 px-3 rounded-lg bg-zinc-900 border border-zinc-800 text-sm font-mono text-zinc-300" />
              <button onClick={copyLink} className="h-10 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition-colors">{linkCopied ? "Copied!" : "Copy"}</button>
            </div>
            <p className="text-xs text-zinc-500 mt-3">Room code: <span className="font-mono font-bold text-zinc-300">{roomCode}</span></p>
            <button onClick={() => setShowShareModal(false)} className="w-full mt-4 h-9 rounded-lg bg-zinc-900 border border-zinc-800 text-sm font-semibold text-zinc-400 hover:text-white transition-colors">Close</button>
          </div>
        </div>
      )}

      {/* Episode modal — opens on EPISODES button click. Shows grid of episode
          buttons; current episode highlighted green. Only host can switch eps. */}
      {showEpisodeModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" onClick={() => setShowEpisodeModal(false)}>
          <div className="w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-950 p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-white">Episodes</h3>
                <p className="text-xs text-zinc-500 mt-0.5">{episodeCount} episode{episodeCount !== 1 ? "s" : ""} · Now playing: Episode {state.episodeNum}</p>
              </div>
              <button onClick={() => setShowEpisodeModal(false)} className="w-8 h-8 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center transition-colors">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-1.5 max-h-[60vh] overflow-y-auto pr-1">
              {Array.from({ length: episodeCount }, (_, i) => i + 1).map(ep => {
                const isCurrent = ep === state.episodeNum;
                const canSwitch = isHost;
                return (
                  <button
                    key={ep}
                    onClick={() => {
                      if (!canSwitch) return;
                      if (wsRef.current) {
                        wsRef.current.sendStateUpdate({ playing: false, currentTime: 0, episodeNum: ep });
                      }
                      setState(prev => ({ ...prev, episodeNum: ep, playing: false, currentTime: 0 }));
                      fetchServers(ep);
                      setShowEpisodeModal(false);
                    }}
                    disabled={!canSwitch}
                    title={canSwitch ? `Play episode ${ep}` : "Only the host can switch episodes"}
                    className={`h-9 rounded text-xs font-bold transition-all ${isCurrent ? "bg-green-500 text-black border-2 border-green-400" : canSwitch ? "bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white border border-zinc-800" : "bg-zinc-900 text-zinc-600 border border-zinc-900 cursor-not-allowed opacity-60"}`}
                    style={isCurrent ? { clipPath: "polygon(8% 0, 100% 0, 92% 100%, 0 100%)" } : undefined}
                  >
                    {ep}
                  </button>
                );
              })}
            </div>
            {!isHost && (
              <p className="text-xs text-zinc-500 mt-4 text-center">Only the host can switch episodes. Ask them to change it.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
