"use client";

import { useState } from "react";
import { useAppStore } from "./store";

/* ═══════════════════════════════════════════════════════════════════════
   CRYPTO DONATION PAGE

   Its own route rather than a modal: the coin list plus the claim form is
   far too much content for a bottom sheet on a phone, which is what this
   replaces.

   Flow is two explicit steps — copy an address, then submit the transaction
   hash so a human can verify it and award the supporter badge.
   ═══════════════════════════════════════════════════════════════════════ */

const FONT = "var(--font-karla), Karla, sans-serif";

type Coin = { name: string; symbol: string; network: string; address: string };

const CRYPTO: Coin[] = [
  { name: "Tether",   symbol: "USDT", network: "TRC-20",   address: "TF1n9RH3iKZ4KgaiSo32RANEghGxcaKoQt" },
  { name: "Bitcoin",  symbol: "BTC",  network: "Bitcoin",  address: "1HT9TxgPh4ZyVo25LZtK4CVsMjPoyRFPrF" },
  { name: "Ethereum", symbol: "ETH",  network: "ERC-20",   address: "0xb5ce6f77577f570e7b39b97a73dcdf712a996e78" },
  { name: "Litecoin", symbol: "LTC",  network: "Litecoin", address: "LQijhVJQz93sU6jQ4F97tg2FZfYH1d3Txc" },
  { name: "Solana",   symbol: "SOL",  network: "Solana",   address: "5uaeXwDgvPWakpsGdVwzPWD9WH8jDdNr5mPPZLKxLoS4" },
];

/** Clipboard with a fallback for non-secure origins / older mobile browsers,
 *  where navigator.clipboard is unavailable and fails silently. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

export default function CryptoDonatePage() {
  const navigate = useAppStore((s) => s.navigate);
  const user = useAppStore((s: any) => s.user);

  const [copied, setCopied] = useState<string | null>(null);
  const [method, setMethod] = useState<"crypto" | "patreon">("crypto");
  const [coin, setCoin] = useState<string>(CRYPTO[0].symbol);
  const [patreon, setPatreon] = useState("");
  const [txid, setTxid] = useState("");
  const [discord, setDiscord] = useState("");
  const [username, setUsername] = useState(user?.username || "");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const onCopy = async (c: Coin) => {
    if (await copyText(c.address)) {
      setCoin(c.symbol);           // pre-select in the form — most people send what they just copied
      setMethod("crypto");
      setCopied(c.symbol);
      setTimeout(() => setCopied((v) => (v === c.symbol ? null : v)), 1800);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/donate/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ method, coin, txid, patreon, discord, username, note }),
      });
      const data = await res.json();
      setResult({ ok: !!data?.ok, message: data?.message || data?.error || "Something went wrong." });
      if (data?.ok) { setTxid(""); setPatreon(""); setNote(""); }
    } catch {
      setResult({ ok: false, message: "Couldn't reach the server. Please try again." });
    }
    setSending(false);
  };

  return (
    <div className="w-full px-3 sm:px-4 lg:px-4 pb-16">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 mt-4 mb-3">
        <button
          onClick={() => navigate({ page: "donate" })}
          className="w-9 h-9 rounded-xl grid place-items-center border border-white/10 text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors shrink-0"
          aria-label="Back to support page"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div className="min-w-0">
          <h1 className="font-black text-2xl sm:text-3xl leading-none" style={{ fontFamily: FONT }}>Donate &amp; claim</h1>
          <p className="text-white/45 text-[13px] mt-1.5">Send, then tell us — Patreon pledges can be claimed here too.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

        {/* ── Step 1 — coins ── */}
        <section className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 sm:p-5">
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-lg grid place-items-center bg-white text-[#08080c] text-sm font-black shrink-0">1</span>
            <h2 className="font-black text-lg" style={{ fontFamily: FONT }}>Send any of these</h2>
          </div>

          <div className="space-y-2 mt-4">
            {CRYPTO.map((c) => {
              const isCopied = copied === c.symbol;
              return (
                <button
                  key={c.symbol}
                  onClick={() => onCopy(c)}
                  className={`w-full text-left rounded-xl border p-3.5 transition-colors group ${
                    isCopied
                      ? "border-[#22c55e]/45 bg-[#22c55e]/[0.07]"
                      : "border-white/[0.08] bg-black/25 hover:bg-white/[0.05] hover:border-white/[0.16]"
                  }`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-[15px]" style={{ fontFamily: FONT }}>{c.name}</span>
                    <span className="rounded-md bg-white/[0.08] px-1.5 py-0.5 text-[10px] font-black tracking-wider">{c.symbol}</span>
                    {/* Network is never hidden — sending on the wrong chain is unrecoverable */}
                    <span className="rounded-md border border-[#ec4899]/35 bg-[#ec4899]/10 text-[#ec4899] px-1.5 py-0.5 text-[10px] font-bold">
                      {c.network}
                    </span>
                    <span className={`ml-auto text-[11px] font-bold shrink-0 ${isCopied ? "text-[#22c55e]" : "text-white/35 group-hover:text-white/70"}`}>
                      {isCopied ? "Copied" : "Tap to copy"}
                    </span>
                  </div>
                  <p className="font-mono text-[11px] sm:text-xs text-white/45 break-all mt-2 leading-relaxed">{c.address}</p>
                </button>
              );
            })}
          </div>

          <p className="text-white/35 text-[12px] leading-relaxed mt-4">
            Send only on the network shown beside each address. A transfer sent on the
            wrong chain cannot be recovered by anyone.
          </p>
        </section>

        {/* ── Step 2 — claim ── */}
        <section className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 sm:p-5 self-start">
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-lg grid place-items-center bg-white text-[#08080c] text-sm font-black shrink-0">2</span>
            <h2 className="font-black text-lg" style={{ fontFamily: FONT }}>Claim your badge</h2>
          </div>
          <p className="text-white/45 text-[13px] leading-relaxed mt-2">
            Payments don&apos;t carry your username, so tell us what to look for and
            we&apos;ll match it to your account.
          </p>

          <form onSubmit={submit} className="space-y-3.5 mt-4">
            {/* How you donated */}
            <div>
              <span className="block text-[11px] font-black uppercase tracking-wider text-white/45 mb-1.5">How did you donate?</span>
              <div className="grid grid-cols-2 gap-2">
                {(["crypto", "patreon"] as const).map((mth) => (
                  <button
                    key={mth}
                    type="button"
                    onClick={() => setMethod(mth)}
                    className={`rounded-xl px-3 py-2.5 text-sm font-bold capitalize transition-colors border ${
                      method === mth
                        ? "bg-white text-[#08080c] border-white"
                        : "border-white/10 bg-black/40 text-white/55 hover:text-white hover:bg-white/[0.06]"
                    }`}
                  >
                    {mth}
                  </button>
                ))}
              </div>
            </div>

            {method === "crypto" ? (
              <>
                {/* Coin */}
                <div>
                  <label htmlFor="cd-coin" className="block text-[11px] font-black uppercase tracking-wider text-white/45 mb-1.5">Which coin did you send?</label>
                  <select
                    id="cd-coin"
                    value={coin}
                    onChange={(e) => setCoin(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-3 text-sm text-white outline-none focus:border-white/30 transition-colors"
                  >
                    {CRYPTO.map((c) => <option key={c.symbol} value={c.symbol}>{c.name} ({c.symbol} · {c.network})</option>)}
                  </select>
                </div>

                {/* TX ID */}
                <div>
                  <label htmlFor="cd-tx" className="block text-[11px] font-black uppercase tracking-wider text-white/45 mb-1.5">Transaction ID</label>
                  <input
                    id="cd-tx"
                    value={txid}
                    onChange={(e) => setTxid(e.target.value)}
                    required
                    spellCheck={false}
                    autoComplete="off"
                    placeholder="Paste the tx hash from your wallet"
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-3 text-sm font-mono text-white placeholder-white/25 outline-none focus:border-white/30 transition-colors"
                  />
                  <p className="text-white/30 text-[11px] mt-1.5">Your wallet lists this as “TxID”, “Transaction hash” or “Signature”.</p>
                </div>
              </>
            ) : (
              /* Patreon pledges already carry a name, so we match on the handle
                 instead of a payment hash. */
              <div>
                <label htmlFor="cd-patreon" className="block text-[11px] font-black uppercase tracking-wider text-white/45 mb-1.5">Patreon name or email</label>
                <input
                  id="cd-patreon"
                  value={patreon}
                  onChange={(e) => setPatreon(e.target.value)}
                  required
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="The name on your pledge"
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-3 text-sm text-white placeholder-white/25 outline-none focus:border-white/30 transition-colors"
                />
                <p className="text-white/30 text-[11px] mt-1.5">Whatever your pledge shows on our Patreon page, so we can find it.</p>
              </div>
            )}

            {/* Discord */}
            <div>
              <label htmlFor="cd-discord" className="block text-[11px] font-black uppercase tracking-wider text-white/45 mb-1.5">Discord username</label>
              <input
                id="cd-discord"
                value={discord}
                onChange={(e) => setDiscord(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                placeholder="yourname"
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-3 text-sm text-white placeholder-white/25 outline-none focus:border-white/30 transition-colors"
              />
            </div>

            {/* Site username */}
            <div>
              <label htmlFor="cd-user" className="block text-[11px] font-black uppercase tracking-wider text-white/45 mb-1.5">
                LuffyTV username
              </label>
              <input
                id="cd-user"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                placeholder={user?.username ? undefined : "Where the badge goes"}
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-3 text-sm text-white placeholder-white/25 outline-none focus:border-white/30 transition-colors"
              />
              <p className="text-white/30 text-[11px] mt-1.5">
                {user?.username ? "Filled in from your account — change it if the badge should go elsewhere." : "Fill in at least one of Discord or username."}
              </p>
            </div>

            {/* Note */}
            <div>
              <label htmlFor="cd-note" className="block text-[11px] font-black uppercase tracking-wider text-white/45 mb-1.5">
                Message <span className="text-white/25 normal-case tracking-normal font-bold">(optional)</span>
              </label>
              <textarea
                id="cd-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={300}
                placeholder="Anything you want to say"
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-3 text-sm text-white placeholder-white/25 outline-none focus:border-white/30 transition-colors resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={sending}
              className="w-full rounded-xl bg-white text-[#08080c] px-4 py-3 text-sm font-bold hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {sending ? "Submitting…" : "Submit claim"}
            </button>

            {result && (
              <div
                className="rounded-xl border px-4 py-3 text-[13px] leading-relaxed"
                style={result.ok
                  ? { borderColor: "rgba(34,197,94,0.35)", background: "rgba(34,197,94,0.08)", color: "#86efac" }
                  : { borderColor: "rgba(248,113,113,0.35)", background: "rgba(248,113,113,0.08)", color: "#fca5a5" }}
              >
                {result.message}
              </div>
            )}
          </form>

          <p className="text-white/30 text-[12px] leading-relaxed mt-4">
            Claims are checked by hand, so give it a little time.
          </p>
        </section>
      </div>
    </div>
  );
}
