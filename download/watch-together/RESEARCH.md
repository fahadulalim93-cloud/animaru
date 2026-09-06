# Watch Together Feature — Complete Research + Implementation Plan

## What I Captured

I visited **anidap.lol** and **watch2gether.com** with a real headless browser, took screenshots, and recorded the actual WebSocket sync protocol. Here's what I found.

### Screenshots (in `/home/z/my-project/download/watch-together/`)

| File | What it shows |
|---|---|
| `anidap-1-home.png` | AniDap homepage — nav has "Watch2gether" link |
| `anidap-w2g-1-landing.png` | The Watch Parties browse page — grid of public rooms |
| `anidap-room-2-active.png` | Inside a live room — player + chat sidebar |
| `w2g-1-home.png` | Watch2Gether.com landing |

### AniDap's "Watch2gether" Architecture (Reverse-Engineered)

**Two backend services:**
1. **`https://ws.anidap.lol`** — REST API + WebSocket server for room state
2. **`https://chad.anidap.lol/rest/api/`** — existing anime stream URL provider (servers, episodes, sources)

**REST endpoints observed:**
```
GET  /api/v1/rooms/public?page=1&limit=20          → list public rooms
GET  /api/v1/room/{roomId}                          → room state (anime, episode, host, status)
GET  /api/v1/room/{roomId}/users                    → user list
GET  /rest/api/sources?id={slug}&epNum={n}&type=sub&providerId=maze
                                                    → existing stream URL provider
```

**Public room JSON shape:**
```json
{
  "id": "fjNV4S",                       // 6-char room code
  "anime_id": "15451",                  // AniList ID
  "anime_title": "High School DxD NEW",
  "anime_image": "https://s4.anilist.co/...",
  "episode": 3,
  "host": {
    "username": "tholomuel",
    "avatar_image": "https://cdn.noitatnemucod.net/avatar/100x100/mha/avatar-21.png",
    "is_authenticated": true
  },
  "is_public": true,
  "status": "live",                     // or "waiting"
  "created_at": "2026-09-05T21:22:49.677702Z"
}
```

**WebSocket protocol** (the actual sync messages I captured):

Connect: `wss://ws.anidap.lol/api/v1/ws?room_id={roomId}` (with guest token)

Server → Client:
```json
{"t":"host_changed","d":"You are now the host! You can control video playback.","ts":"..."}
{"t":"host","u":{"username":"Guest9204","avatar_image":"/assets/user.png","is_authenticated":false},"d":{...},"ts":"..."}
{"t":"chat","u":{"username":"System","is_authenticated":false},"d":"Guest9204 joined the room","ts":"..."}
{"t":"pong","d":{"server_time":1788693473},"ts":"..."}
```

Client → Server (host broadcasting sync state every 10s):
```json
{"t":"sync","d":{"time":0,"playing":false},"ts":"2026-09-06T11:17:18.628Z"}
{"t":"sync","d":{"time":1.209776,"playing":true},"ts":"2026-09-06T11:17:48.628Z"}
{"t":"ping","d":{"timestamp":1788693473609},"ts":"..."}
```

**Message types:**
| `t` | Direction | Purpose |
|---|---|---|
| `host` | S→C | Tells client who the host is |
| `host_changed` | S→C | You became host (host left, you're next) |
| `chat` | S→C (broadcast) | Chat message or system message ("X joined") |
| `sync` | C→S (host only), S→C (to viewers) | `{time, playing}` — playback state |
| `ping` / `pong` | bidirectional | Keep-alive + clock sync |

**The sync model is dead simple:**
- Host's video player emits `sync` events every 10 seconds with `{time, playing}`.
- Server fans out the sync message to all other clients in the room.
- Viewers' players set `currentTime` and play/pause to match.

No WebRTC. No P2P mesh. No server-side video transcoding. Just **a fan-out WebSocket relay** for tiny sync messages. The video itself is fetched independently by each client from the same CDN URL.

---

## How the Big Players Do It

### Watch2Gether (w2g.tv) — the original
- **Architecture:** Same as AniDap — WebSocket relay + per-client video fetching
- **URL:** `w2g.tv/rooms/<8-char-id>` — invite link is just the URL
- **Source:** User pastes a YouTube/Vimeo URL or uploads MP4 — server stores it in a "playlist"
- **Sync:** Host controls playback; viewers follow
- **No WebRTC** — it's just a sync relay, not a video relay

### Teleparty (formerly Netflix Party)
- **Browser extension** (not a website) — injects a sync overlay on top of Netflix/Disney+/HBO/etc.
- **Architecture:** Extension captures video element events on the real Netflix page, sends to a central server, fans out to other extension instances
- **Sync:** Same `{time, playing, lastActionTime}` model
- **Chat:** Sidebar with text chat + emojis

### Discord Watch Party / YouTube Watch Parties
- **Discord:** Uses **Go Live** (formerly screen share) — actual video streamed via WebRTC from host's screen to viewers
- **YouTube:** Watch Parties are YouTube Premieres at a fixed scheduled time — no real sync needed, everyone just watches the same video at the same scheduled start
- **Twitch Watch Parties:** Same as YouTube — synchronized content from Amazon's catalog, started at a fixed time

### Kast / Rabbit (defunct)
- **Architecture:** **WebRTC screen share** — host's screen is broadcast as video
- **Heavyweight:** Requires video encoding on host, bandwidth for N viewers
- **Quality:** Lower than direct streaming because video gets re-encoded

### Two.seven
- **Browser extension** that supports multiple streaming services simultaneously
- **Architecture:** WebSocket relay + per-service player controls
- **Special feature:** Each viewer can watch on a different service if needed

### SyncPlay (open source)
- **Desktop app** (VLC/mpv plugin)
- **Architecture:** Direct TCP connection between users (P2P-ish, no central server)
- **Sync:** Each client shares its player state via a tiny protocol

---

## Architecture Decision for LuffyTV

| Approach | Pros | Cons | Verdict |
|---|---|---|---|
| **WebRTC screen share** (Kast-style) | Works with ANY video source | Host bandwidth = viewers × quality; quality drops | ✗ Overkill |
| **WebRTC video relay** | P2P, no server costs | Complex NAT traversal, TURN costs, fragile | ✗ Too complex |
| **WebSocket sync relay + per-client CDN fetch** (AniDap/W2G style) | Simple, cheap, works with your existing HLS infrastructure | All viewers must use the same source URL | ✓ **CHOOSE THIS** |
| **Polling REST** (no WS) | Easy | Laggy (1-3s delays), high server load | ✗ Bad UX |

**LuffyTV's choice:** WebSocket sync relay. Your existing `hls-player-new.tsx` already handles HLS playback with multi-source fallback. Watch Together just adds:
1. A WebSocket server that relays sync/chat events
2. A room state database (which anime, which episode, who's host)
3. UI for room creation/join + chat sidebar + sync indicator

---

## Implementation Plan for LuffyTV

### Phase 1: WebSocket Server (Cloudflare Durable Objects)

**Why Durable Objects?**
- Each room = 1 Durable Object (single global source of truth per room)
- Built-in WebSocket Hibernation API (scales to millions of idle connections for ~$0)
- No external database needed (state lives in the DO)
- Already on Cloudflare Workers — fits your existing `worker/luffytv-proxy.js` pattern

**`worker/luffytv-watchtogether.js`:**

```javascript
// Cloudflare Durable Object — one instance per room
export class WatchTogetherRoom {
  constructor(state, env) {
    this.state = state;
    this.sessions = new Map();  // ws -> {userId, username, isHost}
    this.roomState = { animeId: null, episode: 1, source: null, hostId: null };
  }

  async fetch(request) {
    const upgrade = request.headers.get("Upgrade");
    if (upgrade !== "websocket") {
      const url = new URL(request.url);
      if (url.pathname === "/state") {
        return Response.json(this.roomState);
      }
      return new Response("Not found", { status: 404 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.handleSession(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  handleSession(ws) {
    ws.accept();
    const sessionId = crypto.randomUUID();
    this.sessions.set(ws, { userId: sessionId, username: `Guest${Math.floor(Math.random()*9999)}`, isHost: false });

    // First connection becomes host
    if (this.sessions.size === 1) {
      const s = this.sessions.get(ws);
      s.isHost = true;
      this.roomState.hostId = sessionId;
      ws.send(JSON.stringify({ t: "host_changed", d: "You are the host!" }));
    }

    // Send current room state to new joiner
    ws.send(JSON.stringify({ t: "state", d: this.roomState }));
    ws.send(JSON.stringify({ t: "chat", u: { username: "System" }, d: "Joined the room" }));

    // Notify others
    this.broadcast({ t: "user_joined", d: { userId: sessionId } }, ws);

    ws.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.t) {
          case "sync":
            // Only host can broadcast sync
            if (this.sessions.get(ws)?.isHost) {
              this.roomState.currentTime = msg.d.time;
              this.roomState.playing = msg.d.playing;
              this.broadcast({ t: "sync", d: msg.d }, ws);
            }
            break;
          case "chat":
            this.broadcast({ t: "chat", u: this.sessions.get(ws), d: msg.d }, ws);
            break;
          case "load_anime":
            // Host changes what's playing
            if (this.sessions.get(ws)?.isHost) {
              this.roomState.animeId = msg.d.animeId;
              this.roomState.episode = msg.d.episode;
              this.roomState.source = msg.d.source;
              this.broadcast({ t: "load_anime", d: msg.d });
            }
            break;
          case "ping":
            ws.send(JSON.stringify({ t: "pong", d: { server_time: Date.now() } }));
            break;
        }
      } catch (e) {}
    });

    ws.addEventListener("close", () => {
      const leaving = this.sessions.get(ws);
      this.sessions.delete(ws);
      // If host left, promote next user
      if (leaving?.isHost && this.sessions.size > 0) {
        const [nextWs, nextS] = this.sessions.entries().next().value;
        nextS.isHost = true;
        this.roomState.hostId = nextS.userId;
        nextWs.send(JSON.stringify({ t: "host_changed", d: "You are now the host!" }));
      }
      this.broadcast({ t: "user_left", d: { userId: leaving?.userId } });
    });
  }

  broadcast(msg, exceptWs = null) {
    for (const [ws] of this.sessions) {
      if (ws !== exceptWs) {
        try { ws.send(JSON.stringify(msg)); } catch {}
      }
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Route: /ws/{roomId} → durable object
    const match = url.pathname.match(/^\/ws\/([a-zA-Z0-9]{6})$/);
    if (match) {
      const roomId = match[1];
      const id = env.WATCH_TOGETHER.idFromName(roomId);
      const stub = env.WATCH_TOGETHER.get(id);
      return stub.fetch(request);
    }
    // Route: /api/rooms → list/create public rooms (uses KV)
    if (url.pathname === "/api/rooms" && request.method === "POST") {
      const { animeId, episode, host } = await request.json();
      const roomId = Math.random().toString(36).slice(2, 8);
      await env.ROOMS_KV.put(`room:${roomId}`, JSON.stringify({
        id: roomId, animeId, episode, host, status: "live",
        isPublic: true, createdAt: Date.now()
      }), { expirationTtl: 86400 });
      return Response.json({ roomId });
    }
    if (url.pathname === "/api/rooms/public") {
      const list = await env.ROOMS_KV.list({ prefix: "room:" });
      const rooms = await Promise.all(list.keys.map(k => env.ROOMS_KV.get(k.name).then(JSON.parse)));
      return Response.json({ rooms: rooms.filter(r => r.isPublic) });
    }
    return new Response("Not found", { status: 404 });
  }
};
```

**`wrangler.toml`:**
```toml
[[durable_objects.bindings]]
name = "WATCH_TOGETHER"
class_name = "WatchTogetherRoom"

[[kv_namespaces]]
binding = "ROOMS_KV"
id = "your-kv-namespace-id"
```

### Phase 2: Client-Side React Hook

**`src/hooks/use-watch-together.ts`:**

```typescript
import { useEffect, useRef, useState, useCallback } from "react";

interface SyncState {
  time: number;
  playing: boolean;
}

interface ChatMessage {
  id: string;
  username: string;
  avatar?: string;
  text: string;
  ts: number;
  isSystem?: boolean;
}

export function useWatchTogether(roomId: string, videoEl: React.RefObject<HTMLVideoElement>) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [users, setUsers] = useState<number>(0);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [syncState, setSyncState] = useState<SyncState>({ time: 0, playing: false });

  // Connect
  useEffect(() => {
    const ws = new WebSocket(`wss://luffytv-watchtogether.workers.dev/ws/${roomId}`);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      switch (msg.t) {
        case "host_changed":
          setIsHost(true);
          break;
        case "sync":
          if (!isHost && videoEl.current) {
            const drift = Math.abs(videoEl.current.currentTime - msg.d.time);
            if (drift > 0.5) videoEl.current.currentTime = msg.d.time;
            if (msg.d.playing && videoEl.current.paused) videoEl.current.play();
            else if (!msg.d.playing && !videoEl.current.paused) videoEl.current.pause();
            setSyncState(msg.d);
          }
          break;
        case "chat":
          setChat(c => [...c, { id: crypto.randomUUID(), username: msg.u.username, text: msg.d, ts: Date.now(), isSystem: msg.u.username === "System" }]);
          break;
        case "user_joined":
          setUsers(u => u + 1);
          break;
        case "user_left":
          setUsers(u => Math.max(0, u - 1));
          break;
        case "load_anime":
          // Trigger navigation to new anime/episode
          window.location.href = `/watch/${msg.d.animeId}?ep=${msg.d.episode}&room=${roomId}`;
          break;
      }
    };

    return () => ws.close();
  }, [roomId, isHost]);

  // Host: emit sync every 2s + on play/pause/seek
  useEffect(() => {
    if (!isHost || !videoEl.current) return;
    const v = videoEl.current;

    const emitSync = () => {
      wsRef.current?.send(JSON.stringify({
        t: "sync",
        d: { time: v.currentTime, playing: !v.paused }
      }));
    };

    const interval = setInterval(emitSync, 2000);
    v.addEventListener("play", emitSync);
    v.addEventListener("pause", emitSync);
    v.addEventListener("seeked", emitSync);

    return () => {
      clearInterval(interval);
      v.removeEventListener("play", emitSync);
      v.removeEventListener("pause", emitSync);
      v.removeEventListener("seeked", emitSync);
    };
  }, [isHost, videoEl]);

  const sendChat = useCallback((text: string) => {
    wsRef.current?.send(JSON.stringify({ t: "chat", d: text }));
  }, []);

  const loadAnime = useCallback((animeId: string, episode: number) => {
    if (isHost) {
      wsRef.current?.send(JSON.stringify({ t: "load_anime", d: { animeId, episode } }));
    }
  }, [isHost]);

  return { isHost, users, chat, syncState, sendChat, loadAnime };
}
```

### Phase 3: UI Components

**Add to `src/components/anime/`:**

1. **`watch-together-sidebar.tsx`** — Chat sidebar (mirror of AniDap's design)
   - Live Chat header with red dot
   - User count
   - Connected status indicator
   - Chat messages list
   - Input field with send button

2. **`watch-together-lobby.tsx`** — Browse public rooms (replaces landing)
   - Grid of room cards
   - Each card: anime poster, episode, host avatar, "LIVE" badge, "Join" button
   - "Create Room" CTA at top

3. **`watch-together-room.tsx`** — Inside a room
   - Video player (reuse `hls-player-new.tsx`)
   - "YOU'RE HOST" badge + End/Controls/Episode buttons
   - Chat sidebar docked right
   - Sync drift indicator

4. **Modify `watch-page.tsx`** — Add "Watch Together" button in player controls
   - Clicking creates a room and copies invite link
   - OR joins existing room via `?room=ABC123` URL param

### Phase 4: API Routes (Next.js)

**`src/app/api/watch-together/rooms/route.ts`:**
```typescript
// GET  /api/watch-together/rooms → proxy to KV public list
// POST /api/watch-together/rooms → create room
```

**`src/app/api/watch-together/rooms/[id]/route.ts`:**
```typescript
// GET    → fetch room state
// DELETE → end room
```

### Phase 5: Page Routes

- `/watch-together` → lobby (browse public rooms + create)
- `/watch-together/[roomId]` → room (player + chat)
- `/watch/[id]?ep=N&room=ABC123` → normal watch page in "join" mode

---

## Cost Estimate (Cloudflare Workers)

| Resource | Free tier | Watch Together usage |
|---|---|---|
| Durable Objects | 100k requests/day free | Each room = ~10 WS msgs/min. 100 active rooms = ~1M req/day → ~$5/mo |
| KV | 100k reads/day, 1k writes/day free | Room list = ~1k reads/day → free |
| Worker requests | 100k/day free | WS upgrades + API = ~10k/day → free |
| WebSocket connections | Unlimited (hibernation) | $0 for idle rooms |

**Total: ~$5/month for 100 concurrent active rooms.**

---

## What to Do First

1. **Spin up the Cloudflare Worker** with the Durable Object code above (Phase 1)
2. **Build the React hook** (Phase 2) — `use-watch-together.ts`
3. **Build the lobby + room UI** (Phase 3) — 3 components
4. **Add the "Watch Together" button** to your existing `watch-page.tsx` — when clicked, creates a room and copies the invite link to clipboard

The protocol is so simple (4 message types: `sync`, `chat`, `load_anime`, `ping/pong`) that you can have a working MVP in a weekend. The hard part is the UI polish, not the sync logic.

## Files Saved

- `/home/z/my-project/download/watch-together/anidap-1-home.png` — AniDap homepage
- `/home/z/my-project/download/watch-together/anidap-w2g-1-landing.png` — Watch Parties lobby
- `/home/z/my-project/download/watch-together/anidap-room-2-active.png` — Inside a live room
- `/home/z/my-project/download/watch-together/anidap-room-protocol.json` — Captured WS messages
- `/home/z/my-project/download/watch-together/w2g-1-home.png` — Watch2Gether.com landing
- `/home/z/my-project/download/watch-together/findings.json` — Network findings summary
