import { NextRequest, NextResponse } from "next/server";
import { pipe, hToStrObj } from "@/lib/kv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Donation claims.
 *
 * POST — a donor submits their transaction hash plus the Discord/site handle
 *        they want credited, so a human can verify the transfer on-chain and
 *        award the supporter badge.
 * GET  — lists claims (admin token required); used to work through the queue.
 *
 * Nothing here moves money or grants anything automatically: it only records
 * "someone says they sent X, here's how to reach them". Verification is manual
 * and deliberate — an endpoint that auto-granted perks from an unverified
 * self-reported hash would be trivially farmable.
 */

const CLAIMS_KEY = "donations:claims";

const COINS = ["USDT", "BTC", "ETH", "LTC", "SOL"];

/** Loose sanity checks only. The point is to reject obvious junk before it
 *  reaches the review queue, not to validate a real on-chain transaction. */
function looksLikeTxid(s: string) {
  return /^[a-zA-Z0-9:_-]{16,120}$/.test(s.replace(/^0x/, "0x"));
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const method = String(body?.method || "crypto").toLowerCase().trim();
  const coin = String(body?.coin || "").toUpperCase().trim();
  const txid = String(body?.txid || "").trim();
  const patreon = String(body?.patreon || "").trim();
  const discord = String(body?.discord || "").trim();
  const username = String(body?.username || "").trim();
  const note = String(body?.note || "").trim().slice(0, 300);

  if (method !== "crypto" && method !== "patreon") {
    return NextResponse.json({ ok: false, error: "Unknown donation method." }, { status: 400 });
  }

  // Crypto transfers are anonymous, so the tx hash is the only proof of payment.
  // Patreon pledges already carry an identity, so the handle is what we match on.
  if (method === "crypto") {
    if (!COINS.includes(coin)) {
      return NextResponse.json({ ok: false, error: "Pick which coin you sent." }, { status: 400 });
    }
    if (!txid || !looksLikeTxid(txid)) {
      return NextResponse.json({ ok: false, error: "That transaction ID doesn't look right. Copy it from your wallet." }, { status: 400 });
    }
  } else if (!patreon || patreon.length < 2) {
    return NextResponse.json({ ok: false, error: "Enter the Patreon name or email you pledged with." }, { status: 400 });
  }

  if (!discord && !username) {
    return NextResponse.json({ ok: false, error: "Give us a Discord name or a site username so we know who to credit." }, { status: 400 });
  }

  // Keyed so re-submitting the same payment updates the existing claim rather
  // than stacking duplicates in the review queue.
  const id = (method === "crypto" ? `${coin}:${txid}` : `patreon:${patreon.toLowerCase()}`).slice(0, 200);

  const existing = await pipe([["HGET", CLAIMS_KEY, id]]);
  const alreadyClaimed = typeof existing[0] === "string" && existing[0].length > 0;

  const record = {
    id,
    method,
    coin: method === "crypto" ? coin : "",
    txid: method === "crypto" ? txid : "",
    patreon: method === "patreon" ? patreon.slice(0, 120) : "",
    discord: discord.slice(0, 80),
    username: username.slice(0, 80),
    note,
    status: "pending" as const,
    submittedAt: Date.now(),
  };

  await pipe([["HSET", CLAIMS_KEY, id, JSON.stringify(record)]]);

  return NextResponse.json({
    ok: true,
    alreadyClaimed,
    message: alreadyClaimed
      ? "We already had this transaction on file — your details have been updated."
      : "Thanks! We'll verify the transfer and get your badge sorted.",
  });
}

export async function GET(req: NextRequest) {
  // Public mode: the supporters wall. Returns ONLY approved claims, and only
  // the display name — never a handle, tx hash, amount or note. Everything
  // else on this endpoint stays admin-gated.
  if (req.nextUrl.searchParams.get("public") === "1") {
    const [raw] = await pipe([["HGETALL", CLAIMS_KEY]]);
    const supporters = Object.values(hToStrObj(raw))
      .map((v) => { try { return JSON.parse(v); } catch { return null; } })
      .filter((c: any) => c && c.status === "approved")
      .map((c: any) => ({
        name: String(c.username || c.discord || "Supporter").slice(0, 40),
        at: c.approvedAt || c.submittedAt || 0,
      }))
      .sort((a: any, b: any) => b.at - a.at)
      .slice(0, 60);

    return NextResponse.json(
      { ok: true, total: supporters.length, supporters },
      { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" } },
    );
  }

  // Admin-only: the full queue contains people's Discord handles.
  const token = req.headers.get("x-admin-token");
  const { isValidAdminToken } = await import("@/lib/admin-token-server");
  if (!(await isValidAdminToken(token))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const [raw] = await pipe([["HGETALL", CLAIMS_KEY]]);
  const map = hToStrObj(raw);
  const claims = Object.values(map)
    .map((v) => { try { return JSON.parse(v); } catch { return null; } })
    .filter(Boolean)
    .sort((a: any, b: any) => (b?.submittedAt || 0) - (a?.submittedAt || 0));

  return NextResponse.json({ ok: true, total: claims.length, claims });
}
