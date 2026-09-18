import { createServer, IncomingMessage, Server as HttpServer } from "http";
import { parse } from "url";
import next from "next";
import { WebSocketServer, WebSocket } from "ws";
import { PrismaClient } from "@prisma/client";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);
const W2G_WS_PATH = "/api/w2g/ws";
const db = new PrismaClient();

// No server-side auth — username is passed directly from localStorage.
// The client checks auth via localStorage before connecting.
function getUserFromUsername(username: string) {
  if (!username || username === "guest") return null;
  return { id: username, username, active: true };
}

interface W2GRoomState { playing: boolean; currentTime: number; updatedAt: number; episodeNum: number; playbackRate?: number; }

async function joinRoom(roomId: string, username: string, isHost: boolean) {
  await db.watchTogetherMember.upsert({ where: { roomId_username: { roomId, username } }, create: { roomId, username, isHost, lastSeen: new Date() }, update: { lastSeen: new Date() } });
  await db.watchTogetherRoom.update({ where: { id: roomId }, data: { lastActivity: new Date() } }).catch(() => {});
}
async function leaveRoom(roomId: string, username: string) { await db.watchTogetherMember.deleteMany({ where: { roomId, username } }); }
async function setMemberMuted(roomId: string, username: string, muted: boolean) { await db.watchTogetherMember.updateMany({ where: { roomId, username }, data: { muted } }); }
async function expireInactiveRooms() {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  await db.watchTogetherRoom.updateMany({ where: { closedAt: null, lastActivity: { lt: cutoff } }, data: { closedAt: now } }).catch(() => {});
}

interface ClientInfo { ws: WebSocket; username: string; roomCode: string; roomId: string; isHost: boolean; lastSeen: number; alive: boolean; }
const clients = new Map<WebSocket, ClientInfo>();
const roomClients = new Map<string, Set<ClientInfo>>();
const userClients = new Map<string, Set<ClientInfo>>();

function getClientsInRoom(roomCode: string): ClientInfo[] { return Array.from(roomClients.get(roomCode) || []); }
function broadcast(roomCode: string, event: string, data: any, except?: WebSocket) {
  const message = JSON.stringify({ event, data });
  for (const client of getClientsInRoom(roomCode)) { if (client.ws === except) continue; if (client.ws.readyState === WebSocket.OPEN) client.ws.send(message); }
}
function send(ws: WebSocket, event: string, data: any) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ event, data })); }

async function broadcastRoomState(roomCode: string) {
  const room = await db.watchTogetherRoom.findUnique({ where: { code: roomCode }, include: { members: true } });
  if (!room) return;
  const members = (room.members || []).map((m: any) => ({ id: m.id, username: m.username, isHost: m.isHost, muted: m.muted }));
  broadcast(roomCode, "room_state", { state: room.state as unknown as W2GRoomState, members, host: { username: room.hostUsername || "unknown" }, animeId: room.animeId, episodeNum: room.episodeNum, animeTitle: room.animeTitle, animeImage: room.animeImage });
}

async function handleW2GConnection(ws: WebSocket, req: IncomingMessage) {
  const url = parse(req.url || "", true);
  const code = (url.query.code as string || "").toUpperCase();
  const session = url.query.session as string; // session = username
  if (!code || !session) { send(ws, "error", { message: "Missing room code or session token" }); ws.close(4001, "Missing params"); return; }
  const user = getUserFromUsername(session);
  if (!user) { send(ws, "error", { message: "Invalid or expired session. Please log in." }); ws.close(4001, "Unauthorized"); return; }
  const room = await db.watchTogetherRoom.findUnique({ where: { code }, include: { members: true } });
  if (!room || room.closedAt) { send(ws, "error", { message: room?.closedAt ? "Room has been closed." : "Room not found." }); ws.close(4001, "Room not found"); return; }
  const isHost = room.hostUsername === user.username;
  await joinRoom(room.id, user.username, isHost);
  const info: ClientInfo = { ws, username: user.username, roomCode: room.code, roomId: room.id, isHost, lastSeen: Date.now(), alive: true };
  clients.set(ws, info);
  if (!roomClients.has(room.code)) roomClients.set(room.code, new Set());
  roomClients.get(room.code)!.add(info);
  if (!userClients.has(user.username)) userClients.set(user.username, new Set());
  userClients.get(user.username)!.add(info);
  await broadcastRoomState(room.code);
  broadcast(room.code, "member_join", { username: user.username, isHost }, ws);
  console.log(`[W2G-WS] ${user.username} joined room ${room.code} (host=${isHost})`);

  ws.on("message", async (raw: Buffer) => {
    let msg: any; try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg.event) return; info.lastSeen = Date.now();
    switch (msg.event) {
      case "ping": send(ws, "pong", { ts: Date.now() }); break;
      case "chat": {
        const text = String(msg.data?.text || "").trim().slice(0, 500);
        if (!text) break;
        broadcast(info.roomCode, "chat", { username: info.username, text, emoji: msg.data?.emoji || null, ts: Date.now() });
        break;
      }
      case "state_update": {
        if (!info.isHost) { send(ws, "error", { message: "Only the host can change playback state." }); break; }
        const newState: W2GRoomState = { playing: Boolean(msg.data?.playing), currentTime: Number(msg.data?.currentTime) || 0, updatedAt: Date.now(), episodeNum: Number(msg.data?.episodeNum) || room.episodeNum, playbackRate: Number(msg.data?.playbackRate) || 1 };
        await db.watchTogetherRoom.update({ where: { id: info.roomId }, data: { state: newState as any, lastActivity: new Date() } });
        broadcast(info.roomCode, "state_update", newState);
        break;
      }
      case "sync_request": { const host = getClientsInRoom(info.roomCode).find((c) => c.isHost); if (host) send(host.ws, "sync_request", { fromUsername: info.username }); break; }
      case "sync_response": {
        const toUsername = msg.data?.toUsername; if (!toUsername) break;
        const targets = userClients.get(toUsername) || new Set();
        for (const c of targets) { if (c.roomCode === info.roomCode) send(c.ws, "sync_response", { fromUsername: info.username, playing: msg.data?.playing, currentTime: msg.data?.currentTime }); }
        break;
      }
      case "voice_signal": {
        const toUsername = msg.data?.toUsername; if (!toUsername) break;
        const targets = userClients.get(toUsername) || new Set();
        for (const c of targets) { if (c.roomCode === info.roomCode) send(c.ws, "voice_signal", { fromUsername: info.username, signal: msg.data?.signal }); }
        break;
      }
      case "self_mute": { const muted = Boolean(msg.data?.muted); await setMemberMuted(info.roomId, info.username, muted); broadcast(info.roomCode, "voice_mute", { username: info.username, muted }); break; }
      case "voice_mute": {
        if (!info.isHost) { send(ws, "error", { message: "Only the host can mute others." }); break; }
        const targetUsername = msg.data?.username; const muted = Boolean(msg.data?.muted); if (!targetUsername) break;
        await setMemberMuted(info.roomId, targetUsername, muted); broadcast(info.roomCode, "voice_mute", { username: targetUsername, muted });
        break;
      }
      case "kick_user": {
        if (!info.isHost) { send(ws, "error", { message: "Only the host can kick users." }); break; }
        const targetUsername = msg.data?.username; if (!targetUsername) break;
        const targets = userClients.get(targetUsername) || new Set();
        for (const c of targets) { if (c.roomCode === info.roomCode) { send(c.ws, "kicked", { reason: "Kicked by host" }); c.ws.close(4003, "Kicked by host"); } }
        await leaveRoom(info.roomId, targetUsername); broadcast(info.roomCode, "member_leave", { username: targetUsername });
        break;
      }
      case "heartbeat": info.alive = true; db.watchTogetherMember.updateMany({ where: { roomId: info.roomId, username: info.username }, data: { lastSeen: new Date() } }).catch(() => {}); break;
    }
  });

  ws.on("close", async () => {
    if (!clients.has(ws)) return;
    clients.delete(ws);
    roomClients.get(info.roomCode)?.delete(info);
    if (roomClients.get(info.roomCode)?.size === 0) roomClients.delete(info.roomCode);
    userClients.get(info.username)?.delete(info);
    if (userClients.get(info.username)?.size === 0) userClients.delete(info.username);
    const stillConnected = Array.from(userClients.get(info.username) || []).some((c) => c.roomCode === info.roomCode);
    if (!stillConnected) {
      await leaveRoom(info.roomId, info.username);
      if (info.isHost) {
        await db.watchTogetherRoom.update({ where: { id: info.roomId }, data: { closedAt: new Date() } }).catch(() => {});
        broadcast(info.roomCode, "room_closed", { reason: "Host left" });
      } else { broadcast(info.roomCode, "member_leave", { username: info.username }); }
    }
    console.log(`[W2G-WS] ${info.username} left room ${info.roomCode}`);
  });
  ws.on("error", () => {});
}

setInterval(() => {
  const now = Date.now();
  for (const [ws, info] of clients) {
    if (now - info.lastSeen > 60000) { console.log(`[W2G-WS] timeout: ${info.username}`); ws.terminate(); continue; }
    if (info.alive) { info.alive = false; send(ws, "ping", { ts: now }); }
  }
}, 25000);
setInterval(() => { expireInactiveRooms().catch(() => {}); }, 10 * 60 * 1000);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();
app.prepare().then(() => {
  const server: HttpServer = createServer((req, res) => { const parsedUrl = parse(req.url!, true); handle(req, res, parsedUrl); });
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req: IncomingMessage, socket: any, head: Buffer) => {
    const { pathname } = parse(req.url || "", true);
    if (pathname === W2G_WS_PATH) { wss.handleUpgrade(req, socket, head, (ws) => handleW2GConnection(ws, req)); }
    else if (pathname === "/_next/webpack-hmr" && dev) { /* let Next.js handle HMR in dev */ }
    else { socket.destroy(); }
  });
  server.listen(port, () => { console.log(`> Ready on http://${hostname}:${port} (dev=${dev})`); console.log(`> W2G WebSocket at ${W2G_WS_PATH}`); });
});
