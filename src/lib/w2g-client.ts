"use client";

export type W2GEvent =
  | "room_state" | "chat" | "state_update" | "member_join" | "member_leave"
  | "voice_signal" | "voice_mute" | "kicked" | "room_closed" | "error"
  | "connected" | "disconnected";

interface W2GMessage { event: W2GEvent; data: any; }
type Listener = (data: any) => void;

export class W2GClient {
  private ws: WebSocket | null = null;
  private listeners = new Map<W2GEvent, Set<Listener>>();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private shouldReconnect = true;

  constructor(private roomCode: string, private sessionUsername: string) {}

  on(event: W2GEvent, fn: Listener): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
    return () => this.listeners.get(event)?.delete(fn);
  }

  private emit(event: W2GEvent, data: any) {
    this.listeners.get(event)?.forEach((fn) => { try { fn(data); } catch (e) { console.error("[W2G] listener error:", e); } });
  }

  connect() { this.shouldReconnect = true; this.openSocket(); }

  private openSocket() {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${window.location.host}/api/w2g/ws?code=${encodeURIComponent(this.roomCode)}&session=${encodeURIComponent(this.sessionUsername)}`;
    console.log(`[W2G] connecting to ${url}`);
    this.ws = new WebSocket(url);
    this.ws.onopen = () => { console.log(`[W2G] connected to room ${this.roomCode}`); this.reconnectAttempts = 0; this.emit("connected", {}); this.startHeartbeat(); };
    this.ws.onmessage = (ev) => { try { const msg: W2GMessage = JSON.parse(ev.data); this.emit(msg.event, msg.data); } catch (e) { console.warn("[W2G] bad message:", ev.data); } };
    this.ws.onerror = (e) => { console.error("[W2G] socket error:", e); };
    this.ws.onclose = (ev) => {
      console.log(`[W2G] disconnected (code=${ev.code}, reason=${ev.reason})`);
      this.stopHeartbeat(); this.emit("disconnected", { code: ev.code, reason: ev.reason });
      if (ev.code === 4001 || ev.code === 4003) { this.shouldReconnect = false; return; }
      if (this.shouldReconnect) this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 10000);
    console.log(`[W2G] reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.openSocket(); }, delay);
  }

  private startHeartbeat() { this.stopHeartbeat(); this.heartbeatTimer = setInterval(() => this.send("heartbeat", {}), 20 * 1000); }
  private stopHeartbeat() { if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; } }

  send(event: string, data: any) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ event, data })); }
  sendChat(text: string, emoji?: string) { this.send("chat", { text, emoji }); }
  sendStateUpdate(state: { playing: boolean; currentTime: number; episodeNum?: number; playbackRate?: number; }) { this.send("state_update", state); }
  requestSync() { this.send("sync_request", {}); }
  sendVoiceSignal(toUsername: string, signal: any) { this.send("voice_signal", { toUsername, signal }); }
  selfMute(muted: boolean) { this.send("self_mute", { muted }); }
  muteUser(username: string, muted: boolean) { this.send("voice_mute", { username, muted }); }
  kickUser(username: string) { this.send("kick_user", { username }); }

  disconnect() {
    this.shouldReconnect = false; this.stopHeartbeat();
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.ws) { this.ws.close(1000, "client disconnect"); this.ws = null; }
  }
}
