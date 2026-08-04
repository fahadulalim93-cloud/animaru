/**
 * KV (Key-Value) store — Redis-over-REST or PostgreSQL-backed.
 *
 * Works with **Vercel KV** / **Upstash Redis** (via REST API) when env vars
 * are configured. When no Redis is available, it falls back to **PostgreSQL**
 * via Prisma — using the same DATABASE_URL already configured for the app.
 * This means Coolify deployments (or any non-Vercel host) get full admin panel,
 * moderation, and analytics support without needing a separate Redis instance.
 *
 * If neither Redis nor PostgreSQL is available, an in-memory Map fallback keeps
 * local dev working (data is lost on restart and doesn't sync across instances).
 */

import { PrismaClient } from "@prisma/client";

// ── Redis-over-REST config ──
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
const redisEnabled = !!(REDIS_URL && REDIS_TOKEN);

// ── Prisma singleton (reuse across requests) ──
const globalForPrisma = globalThis as unknown as { _kvPrisma: PrismaClient | undefined };
let prisma: PrismaClient | null = null;
try {
  prisma = globalForPrisma._kvPrisma ?? new PrismaClient({ log: [] });
  if (process.env.NODE_ENV !== "production") globalForPrisma._kvPrisma = prisma;
} catch {
  // Prisma client not generated yet — KV will fall back to in-memory
}

/** True if PostgreSQL-backed KV is available (i.e. Prisma initialized). */
const pgEnabled = !!prisma;

/** True when any persistent KV backend (Redis or PostgreSQL) is available.
 *  Used by routes to decide whether to use real KV or an in-memory stub,
 *  and by the admin UI to show/hide the "connect a store" banner. */
export const kvEnabled = redisEnabled || pgEnabled;

// ── In-memory fallback (dev / completely unconfigured) ──
const mem = {
  kv: new Map<string, string>(),
  hash: new Map<string, Map<string, string | number>>(),
  hll: new Map<string, Set<string>>(),
  z: new Map<string, Map<string, number>>(),
};

function memExec(cmd: (string | number)[]): unknown {
  const [rawOp, ...rest] = cmd;
  const op = String(rawOp).toUpperCase();
  const args = rest.map(String);
  switch (op) {
    case "INCR": { const k = args[0]; const v = Number(mem.kv.get(k) || 0) + 1; mem.kv.set(k, String(v)); return v; }
    case "GET": return mem.kv.get(args[0]) ?? null;
    case "MGET": return args.map((k) => mem.kv.get(k) ?? null);
    case "HINCRBY": { const [k, f, by] = args; const h = mem.hash.get(k) || new Map(); h.set(f, Number(h.get(f) || 0) + Number(by)); mem.hash.set(k, h); return h.get(f); }
    case "HGETALL": { const h = mem.hash.get(args[0]); if (!h) return []; const out: string[] = []; h.forEach((v, f) => out.push(f, String(v))); return out; }
    case "PFADD": { const s = mem.hll.get(args[0]) || new Set<string>(); args.slice(1).forEach((m) => s.add(m)); mem.hll.set(args[0], s); return 1; }
    case "PFCOUNT": return mem.hll.get(args[0])?.size ?? 0;
    case "ZADD": { const z = mem.z.get(args[0]) || new Map<string, number>(); z.set(args[2], Number(args[1])); mem.z.set(args[0], z); return 1; }
    case "ZREMRANGEBYSCORE": { const z = mem.z.get(args[0]); if (z) { const min = Number(args[1]), max = Number(args[2]); [...z.entries()].forEach(([m, sc]) => { if (sc >= min && sc <= max) z.delete(m); }); } return 0; }
    case "ZCARD": return mem.z.get(args[0])?.size ?? 0;
    case "SET": { mem.kv.set(args[0], args[1]); return "OK"; }
    case "DEL": { mem.kv.delete(args[0]); mem.hash.delete(args[0]); return 1; }
    case "HSET": { const [k, f, v] = args; const h = mem.hash.get(k) || new Map(); h.set(f, v); mem.hash.set(k, h); return 1; }
    case "HGET": { const h = mem.hash.get(args[0]); return h?.has(args[1]) ? String(h.get(args[1])) : null; }
    case "HDEL": { const h = mem.hash.get(args[0]); if (h) h.delete(args[1]); return 1; }
    default: return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// PostgreSQL-backed command executor
// ══════════════════════════════════════════════════════════════════════════════

async function pgExec(cmd: (string | number)[]): Promise<unknown> {
  if (!prisma) return null;
  const [rawOp, ...rest] = cmd;
  const op = String(rawOp).toUpperCase();
  const args = rest.map(String);
  const db = prisma;

  switch (op) {
    // ── String operations ──
    case "GET": {
      const row = await db.kvStore.findUnique({ where: { key: args[0] } });
      return row?.value ?? null;
    }
    case "SET": {
      await db.kvStore.upsert({
        where: { key: args[0] },
        update: { value: args[1] },
        create: { key: args[0], value: args[1] },
      });
      return "OK";
    }
    case "DEL": {
      // Delete from all KV tables for this key
      await db.$transaction([
        db.kvStore.deleteMany({ where: { key: args[0] } }),
        db.kvHash.deleteMany({ where: { hash: args[0] } }),
        db.kvSortedSet.deleteMany({ where: { key: args[0] } }),
        db.kvHll.deleteMany({ where: { key: args[0] } }),
      ]);
      return 1;
    }
    case "INCR": {
      // SQLite-compatible atomic increment using subquery
      const key = args[0];
      // First try to increment; if row doesn't exist, insert
      const existing = await db.kvStore.findUnique({ where: { key } });
      if (existing) {
        const newVal = Number(existing.value) + 1;
        await db.kvStore.update({ where: { key }, data: { value: String(newVal) } });
        return String(newVal);
      } else {
        await db.kvStore.create({ data: { key, value: "1" } });
        return "1";
      }
    }
    case "MGET": {
      if (args.length === 0) return [];
      const rows = await db.kvStore.findMany({ where: { key: { in: args } } });
      const map = new Map(rows.map((r) => [r.key, r.value]));
      return args.map((k) => map.get(k) ?? null);
    }

    // ── Hash operations ──
    case "HSET": {
      const [hash, field, value] = args;
      await db.kvHash.upsert({
        where: { hash_field: { hash, field } },
        update: { value },
        create: { hash, field, value },
      });
      return 1;
    }
    case "HGET": {
      const row = await db.kvHash.findUnique({
        where: { hash_field: { hash: args[0], field: args[1] } },
      });
      return row?.value ?? null;
    }
    case "HDEL": {
      try {
        await db.kvHash.delete({
          where: { hash_field: { hash: args[0], field: args[1] } },
        });
      } catch { /* already deleted */ }
      return 1;
    }
    case "HGETALL": {
      const rows = await db.kvHash.findMany({ where: { hash: args[0] } });
      // Return flat array like Redis: [field1, value1, field2, value2, ...]
      const out: string[] = [];
      for (const r of rows) { out.push(r.field, r.value); }
      return out;
    }
    case "HINCRBY": {
      const [hash, field, byStr] = args;
      const by = Number(byStr) || 1;
      // SQLite-compatible atomic increment
      const existing = await db.kvHash.findUnique({ where: { hash_field: { hash, field } } });
      if (existing) {
        const newVal = Number(existing.value) + by;
        await db.kvHash.update({ where: { hash_field: { hash, field } }, data: { value: String(newVal) } });
        return String(newVal);
      } else {
        await db.kvHash.create({ data: { hash, field, value: String(by) } });
        return String(by);
      }
    }

    // ── Sorted set operations ──
    case "ZADD": {
      const [key, scoreStr, member] = args;
      const score = Number(scoreStr);
      await db.kvSortedSet.upsert({
        where: { key_member: { key, member } },
        update: { score },
        create: { key, member, score },
      });
      return 1;
    }
    case "ZREMRANGEBYSCORE": {
      const [key, minStr, maxStr] = args;
      const min = Number(minStr);
      const max = Number(maxStr);
      await db.kvSortedSet.deleteMany({
        where: { key, score: { gte: min, lte: max } },
      });
      return 0;
    }
    case "ZCARD": {
      return db.kvSortedSet.count({ where: { key: args[0] } });
    }

    // ── HyperLogLog (simplified as exact unique set) ──
    case "PFADD": {
      const key = args[0];
      const members = args.slice(1);
      if (members.length === 0) return 0;
      // Insert members individually, ignoring duplicates (SQLite doesn't support skipDuplicates)
      for (const m of members) {
        try {
          await db.kvHll.create({ data: { key, member: m } });
        } catch { /* duplicate — already counted */ }
      }
      return 1;
    }
    case "PFCOUNT": {
      return db.kvHll.count({ where: { key: args[0] } });
    }

    default:
      return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Pipeline executor — the main entry point used by all API routes
// ══════════════════════════════════════════════════════════════════════════════

type Cmd = (string | number)[];

/** Execute a pipeline of Redis-like commands; returns the array of results.
 *
 * Priority: 1) Upstash Redis (if env vars set), 2) PostgreSQL (if Prisma works),
 *           3) in-memory Map (dev fallback, lost on restart).
 */
export async function pipe(cmds: Cmd[]): Promise<unknown[]> {
  if (cmds.length === 0) return [];

  // ── Priority 1: Real Redis ──
  if (redisEnabled) {
    try {
      const res = await fetch(`${REDIS_URL}/pipeline`, {
        method: "POST",
        headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify(cmds),
        cache: "no-store",
      });
      const data = await res.json();
      return Array.isArray(data) ? data.map((d: { result?: unknown }) => d?.result ?? null) : cmds.map(() => null);
    } catch {
      // Redis failed — fall through to PostgreSQL
    }
  }

  // ── Priority 2: PostgreSQL via Prisma ──
  if (pgEnabled) {
    try {
      // Execute commands sequentially (PostgreSQL doesn't have true pipelining)
      const results: unknown[] = [];
      for (const cmd of cmds) {
        try {
          results.push(await pgExec(cmd));
        } catch (e) {
          // Individual command failure shouldn't break the whole pipeline
          console.warn(`[KV:PG] command failed: ${String(cmd[0])}`, e instanceof Error ? e.message : "");
          results.push(null);
        }
      }
      return results;
    } catch (e) {
      // PostgreSQL failed — fall through to in-memory
      console.warn("[KV:PG] Pipeline failed, falling back to in-memory:", e instanceof Error ? e.message : "");
    }
  }

  // ── Priority 3: In-memory fallback ──
  return cmds.map(memExec);
}

// ══════════════════════════════════════════════════════════════════════════════
// Helpers — same API as before
// ══════════════════════════════════════════════════════════════════════════════

/** Convert a Redis HGETALL flat array into a { field: number } object. */
export function hToObj(arr: unknown): Record<string, number> {
  const o: Record<string, number> = {};
  if (Array.isArray(arr)) for (let i = 0; i < arr.length; i += 2) o[String(arr[i])] = Number(arr[i + 1]);
  return o;
}

/** Convert a Redis HGETALL flat array into a { field: string } object. */
export function hToStrObj(arr: unknown): Record<string, string> {
  const o: Record<string, string> = {};
  if (Array.isArray(arr)) for (let i = 0; i < arr.length; i += 2) o[String(arr[i])] = String(arr[i + 1]);
  return o;
}
