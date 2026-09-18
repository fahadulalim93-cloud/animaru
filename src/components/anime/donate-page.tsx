"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "./store";
import { FRAMES } from "./avatar-frames";

/* ═══════════════════════════════════════════════════════════════════════════
   SUPPORT / DONATE PAGE
   ───────────────────────────────────────────────────────────────────────────
   Sections, top to bottom:

     1.  Hero               headline, pitch, primary actions, live counters
     2.  Running total      how far this month's donations cover the bill
     3.  Methods            crypto (on-site claim flow) and Patreon
     4.  Wallets            inline address list with copy-to-clipboard
     5.  How it works       three-step explanation of the claim process
     6.  Supporter badge    live preview on the reader's own profile
     7.  Perks              what a donation does and does not get you
     8.  Supporters wall    real approved supporters, empty until there are any
     9.  Transparency       itemised running costs with a computed monthly total
    10.  FAQ               accordion of the questions people actually ask
    11.  Closing CTA

   Two rules this file sticks to:

     • Nothing is fabricated. The supporters wall reads approved claims from
       /api/donate/claim?public=1 and shows an honest empty state when there
       are none. No placeholder names, no invented testimonials, no fake
       donation totals.
     • Nothing overpromises. A donation buys a cosmetic badge. Every section
       that mentions perks also states the limits.
   ═══════════════════════════════════════════════════════════════════════════ */

const FONT = "var(--font-karla), Karla, sans-serif";

/* ── Palette ───────────────────────────────────────────────────────────── */

const PINK = "#ec4899";
const CORAL = "#ff424d";     // Patreon brand
const GREEN = "#22c55e";
const AMBER = "#f59e0b";

/* ── Links ─────────────────────────────────────────────────────────────── */

const PATREON_URL = "https://patreon.com/LuffytvStream";
const DISCORD_URL = "https://discord.gg/SdFB3HxDH5";

/** First real overlay frame, used to preview the supporter frame. Null while
 *  `public/frames` has no PNGs installed — the preview falls back to a glow
 *  ring rather than rendering a broken image. */
const showcaseFrame: string | null =
  FRAMES.find((f) => f.key !== "none" && f.src)?.src ?? null;

/* ═══════════════════════════════════════════════════════════════════════════
   DATA
   ═══════════════════════════════════════════════════════════════════════════ */

type Coin = {
  name: string;
  symbol: string;
  /** Chain the address belongs to. Sending on the wrong one destroys the
   *  funds, so this is always displayed beside the address, never hidden. */
  network: string;
  address: string;
  /** Short note shown under the address — why someone might pick this coin. */
  hint: string;
};

const CRYPTO: Coin[] = [
  {
    name: "Tether",
    symbol: "USDT",
    network: "TRC-20",
    address: "TF1n9RH3iKZ4KgaiSo32RANEghGxcaKoQt",
    hint: "Stable value, very low fees. The easiest option for most people.",
  },
  {
    name: "Bitcoin",
    symbol: "BTC",
    network: "Bitcoin",
    address: "1HT9TxgPh4ZyVo25LZtK4CVsMjPoyRFPrF",
    hint: "Widely supported. Fees vary with network congestion.",
  },
  {
    name: "Ethereum",
    symbol: "ETH",
    network: "ERC-20",
    address: "0xb5ce6f77577f570e7b39b97a73dcdf712a996e78",
    hint: "Gas fees can be high at busy times — check before sending.",
  },
  {
    name: "Litecoin",
    symbol: "LTC",
    network: "Litecoin",
    address: "LQijhVJQz93sU6jQ4F97tg2FZfYH1d3Txc",
    hint: "Fast confirmations and consistently cheap transfers.",
  },
  {
    name: "Solana",
    symbol: "SOL",
    network: "Solana",
    address: "5uaeXwDgvPWakpsGdVwzPWD9WH8jDdNr5mPPZLKxLoS4",
    hint: "Near-instant and almost free. Great for small amounts.",
  },
];

type CostRow = {
  name: string;
  /** Numeric monthly figure in USD, used for the computed total. Annual costs
   *  are divided down so the total stays apples-to-apples. */
  monthly: number;
  display: string;
  use: string;
};

const COSTS: CostRow[] = [
  { name: "Hosting", monthly: 20, display: "~$20 / month", use: "Vercel deployment and bandwidth" },
  { name: "Cloudflare", monthly: 5, display: "~$5 / month", use: "Stream and subtitle proxy workers" },
  { name: "Storage & APIs", monthly: 5, display: "~$5 / month", use: "KV store and metadata lookups" },
  { name: "Domain", monthly: 1, display: "~$12 / year", use: "luffytv domain registration" },
];

const MONTHLY_TOTAL = COSTS.reduce((sum, c) => sum + c.monthly, 0);

const PERKS_GET = [
  {
    title: "Supporter badge",
    desc: "A SUPPORTER badge on your LuffyTV profile, visible to everyone who views it.",
  },
  {
    title: "Exclusive avatar frame",
    desc: "A frame around your avatar that only supporters can equip.",
  },
  {
    title: "VIP highlight",
    desc: "Your name highlighted in comments and on the leaderboard.",
  },
  {
    title: "Discord role",
    desc: "A matching supporter role and colour in our Discord server.",
  },
];

const PERKS_NOT_GET = [
  {
    title: "No premium tier",
    desc: "There are no paid-only sections, no early access, and nothing gated behind money.",
  },
  {
    title: "No ad removal",
    desc: "There are no ads on LuffyTV to remove in the first place.",
  },
  {
    title: "No performance boost",
    desc: "No faster servers, no higher quality tiers, no lifted download limits.",
  },
  {
    title: "No influence",
    desc: "Donating does not affect what gets added to the site or when.",
  },
];

const STEPS = [
  {
    n: 1,
    title: "Send it",
    desc: "Copy one of the wallet addresses and send whatever you feel like — there is no minimum, and no suggested amount.",
  },
  {
    n: 2,
    title: "Tell us",
    desc: "Crypto transfers carry no name. Submit your transaction ID with your Discord or site username so we know it was you.",
  },
  {
    n: 3,
    title: "Get your badge",
    desc: "We check the transfer against the blockchain by hand, then your badge, frame and Discord role are applied.",
  },
];

type Faq = { q: string; a: string };

const FAQS: Faq[] = [
  {
    q: "Do I have to donate to use the site?",
    a: "No. Everything on LuffyTV is free and always will be. Nothing is gated behind a payment, and nothing is degraded if you never give anything. This page exists for people who want to help with the bill, not because the site needs it to function.",
  },
  {
    q: "What do I actually get?",
    a: "A supporter badge on your profile, an exclusive avatar frame, a VIP highlight in comments, and a matching role in our Discord. That is the complete list — all of it cosmetic. If you are donating expecting features, please do not.",
  },
  {
    q: "Why crypto rather than a card?",
    a: "Mainstream payment processors regularly terminate accounts belonging to anime streaming sites, which would cut off donations without warning. Crypto has no chargebacks, no account review, and works everywhere. Patreon is offered as the convenient alternative, but crypto is the one that keeps working.",
  },
  {
    q: "How long until I get my badge?",
    a: "Claims are verified by hand against the blockchain, so give it a little time. If it has been several days and nothing has happened, ping us in Discord with your transaction ID.",
  },
  {
    q: "I sent crypto but forgot to submit a claim. What now?",
    a: "Head to the crypto page and submit the claim now. There is no time limit — as long as you have the transaction ID from your wallet, we can still match it to you.",
  },
  {
    q: "Can I donate anonymously?",
    a: "Yes. Just send the transfer and skip the claim form. You will not receive a badge, since we would have no way to know which account to attach it to, but the donation still helps.",
  },
  {
    q: "Is my donation refundable?",
    a: "Crypto transfers cannot be reversed by anyone, including us. Please only send what you are comfortable giving away. Patreon pledges can be cancelled at any time from your own Patreon account.",
  },
  {
    q: "What happens to the money?",
    a: "It offsets part of the running costs listed above — hosting, proxy workers, storage and the domain. Nothing more. The site continues running whether or not anyone donates.",
  },
  {
    q: "Can I cancel a Patreon pledge?",
    a: "Yes, at any time and directly from Patreon. We have no control over your pledge and cannot charge you outside of it.",
  },
];

/* ═══════════════════════════════════════════════════════════════════════════
   ICONS
   ═══════════════════════════════════════════════════════════════════════════ */

const Icon = {
  crypto: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M9 8h4.5a2.5 2.5 0 0 1 0 5H9zM9 13h5a2.5 2.5 0 0 1 0 5H9zM9 8v10M11 6v2M11 18v2" />
    </svg>
  ),
  patreon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="14.5" cy="9.5" r="6.5" />
      <rect x="2" y="3" width="3.6" height="18" rx="0.4" />
    </svg>
  ),
  discord: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  ext: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />
    </svg>
  ),
  copy: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  ),
  check: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ),
  cross: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  ),
  chevron: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  ),
  heart: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 21s-6.7-4.35-9.33-8.05C.4 9.9 1.6 6.1 4.9 5.2c2-.55 3.9.3 5.1 1.85l2 2.6 2-2.6c1.2-1.55 3.1-2.4 5.1-1.85 3.3.9 4.5 4.7 2.23 7.75C18.7 16.65 12 21 12 21z" />
    </svg>
  ),
  shield: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  star: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3 2.2 4.9 5.3.6-4 3.6 1.1 5.2L12 14.8 7.4 17.3l1.1-5.2-4-3.6 5.3-.6z" />
    </svg>
  ),
  users: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  server: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="8" rx="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" />
      <path d="M6 6h.01M6 18h.01" />
    </svg>
  ),
};

/* ═══════════════════════════════════════════════════════════════════════════
   HOOKS
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Copy-to-clipboard with a transient confirmation keyed per item.
 *
 * `navigator.clipboard` requires a secure context and throws silently on
 * older mobile browsers, so there is a hidden-textarea fallback. The
 * confirmation only fires when the copy actually succeeded — showing
 * "Copied" after a failed copy is worse than showing nothing.
 */
function useCopy(resetMs = 1800) {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const copy = useCallback(async (text: string, key: string) => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.top = "-9999px";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }
    if (!ok) return false;
    setCopied(key);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), resetMs);
    return true;
  }, [resetMs]);

  return { copied, copy };
}

/** Approved supporters for the wall. Returns an empty list rather than
 *  inventing names when nobody has been approved yet. */
function useSupporters() {
  const [list, setList] = useState<{ name: string; at: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/donate/claim?public=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && Array.isArray(d?.supporters)) setList(d.supporters); })
      .catch(() => { /* wall simply stays empty */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { list, loading };
}

/* ═══════════════════════════════════════════════════════════════════════════
   SMALL PRESENTATIONAL PIECES
   ═══════════════════════════════════════════════════════════════════════════ */

function Eyebrow({ children, color = "rgba(255,255,255,0.3)" }: { children: React.ReactNode; color?: string }) {
  return (
    <p className="text-[11px] font-black uppercase tracking-[0.18em] mb-2" style={{ color }}>
      {children}
    </p>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-black text-2xl sm:text-3xl tracking-tight" style={{ fontFamily: FONT }}>
      {children}
    </h2>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-10 h-10 rounded-xl grid place-items-center bg-white/[0.06] text-white/70 shrink-0">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="font-black text-lg leading-none tabular-nums" style={{ fontFamily: FONT }}>{value}</p>
        <p className="text-white/35 text-[12px] mt-1">{label}</p>
      </div>
    </div>
  );
}

/* ── Wallet row ────────────────────────────────────────────────────────── */

function WalletRow({
  coin,
  copied,
  onCopy,
}: {
  coin: Coin;
  copied: boolean;
  onCopy: (c: Coin) => void;
}) {
  return (
    <button
      onClick={() => onCopy(coin)}
      className={`w-full text-left rounded-xl border p-4 transition-colors group ${
        copied
          ? "border-[#22c55e]/45 bg-[#22c55e]/[0.07]"
          : "border-white/[0.08] bg-black/25 hover:bg-white/[0.05] hover:border-white/[0.16]"
      }`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-black text-[15px]" style={{ fontFamily: FONT }}>{coin.name}</span>
        <span className="rounded-md bg-white/[0.08] px-1.5 py-0.5 text-[10px] font-black tracking-wider">
          {coin.symbol}
        </span>
        <span
          className="rounded-md px-1.5 py-0.5 text-[10px] font-bold"
          style={{ color: PINK, background: `${PINK}1a`, border: `1px solid ${PINK}59` }}
        >
          {coin.network}
        </span>
        <span
          className={`ml-auto inline-flex items-center gap-1.5 text-[11px] font-bold shrink-0 ${
            copied ? "text-[#22c55e]" : "text-white/35 group-hover:text-white/70"
          }`}
        >
          {copied ? Icon.check : Icon.copy}
          {copied ? "Copied" : "Copy"}
        </span>
      </div>

      <p className="font-mono text-[11px] sm:text-xs text-white/45 break-all mt-2.5 leading-relaxed">
        {coin.address}
      </p>
      <p className="text-white/30 text-[12px] leading-relaxed mt-2">{coin.hint}</p>
    </button>
  );
}

/* ── FAQ item ──────────────────────────────────────────────────────────── */

function FaqItem({
  faq,
  open,
  onToggle,
}: {
  faq: Faq;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-white/[0.07]">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center gap-4 py-4 text-left group"
      >
        <span className="flex-1 font-bold text-[15px] group-hover:text-white transition-colors">
          {faq.q}
        </span>
        <span
          className={`shrink-0 text-white/35 group-hover:text-white transition-all duration-200 ${open ? "rotate-180" : ""}`}
        >
          {Icon.chevron}
        </span>
      </button>

      {/* Grid-rows trick animates to auto height without measuring the node */}
      <div
        className="grid transition-all duration-300 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0 }}
      >
        <div className="overflow-hidden">
          <p className="text-white/45 text-sm leading-relaxed pb-5 pr-8 max-w-3xl">{faq.a}</p>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE
   ═══════════════════════════════════════════════════════════════════════════ */

export default function DonatePage() {
  const navigate = useAppStore((s) => s.navigate);
  const user = useAppStore((s: any) => s.user);

  const { copied, copy } = useCopy();
  const { list: supporters, loading: supportersLoading } = useSupporters();
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [showAllWallets, setShowAllWallets] = useState(false);

  const visibleWallets = useMemo(
    () => (showAllWallets ? CRYPTO : CRYPTO.slice(0, 2)),
    [showAllWallets],
  );

  const onCopyCoin = useCallback((c: Coin) => { copy(c.address, c.symbol); }, [copy]);
  const goCrypto = useCallback(() => navigate({ page: "donate-crypto" } as any), [navigate]);

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 pb-24">

      {/* ═══════════════════════════════════════════════════════════════════
          1. HERO
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-16 pb-14 sm:pt-24 sm:pb-20">
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              `radial-gradient(110% 80% at 85% -15%, ${PINK}2e, transparent 60%),` +
              `radial-gradient(90% 70% at -5% 110%, rgba(139,92,246,0.18), transparent 62%)`,
          }}
        />
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.14), transparent)" }}
        />

        <div className="relative max-w-3xl">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wider"
            style={{ color: PINK, background: `${PINK}1a`, border: `1px solid ${PINK}44` }}
          >
            {Icon.heart} Voluntary
          </span>

          <h1
            className="font-black tracking-tight leading-[0.98] text-[40px] sm:text-[58px] lg:text-[68px] mt-5"
            style={{ fontFamily: FONT }}
          >
            If you&apos;d like,
            <br />
            you can support us.
          </h1>

          <p className="text-white/50 text-base sm:text-lg leading-relaxed mt-6 max-w-2xl">
            LuffyTV is free and stays free. If you want to help with what it costs
            to run, you can — once with crypto, or monthly on Patreon. It gets you
            a badge and <strong className="text-white font-bold">nothing else</strong>.
          </p>

          <div className="flex flex-wrap gap-2.5 mt-8">
            <button
              onClick={goCrypto}
              className="inline-flex items-center gap-2 rounded-xl bg-white text-[#08080c] px-5 py-3 text-sm font-bold hover:bg-white/90 transition-colors"
            >
              {Icon.crypto} Support with crypto
            </button>
            <a
              href={PATREON_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.05] px-5 py-3 text-sm font-bold hover:bg-white/[0.1] transition-colors"
            >
              {Icon.patreon} Patreon {Icon.ext}
            </a>
            <a
              href={DISCORD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.05] px-5 py-3 text-sm font-bold hover:bg-white/[0.1] transition-colors"
            >
              {Icon.discord} Discord
            </a>
          </div>

          {/* Counters — all derived, none invented */}
          <div className="flex flex-wrap gap-x-10 gap-y-5 mt-10">
            <Stat icon={Icon.server} value={`$${MONTHLY_TOTAL}`} label="Monthly running cost" />
            <Stat icon={Icon.crypto} value={String(CRYPTO.length)} label="Coins accepted" />
            <Stat
              icon={Icon.users}
              value={supportersLoading ? "—" : String(supporters.length)}
              label="Supporters so far"
            />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          2. RUNNING COST BAR
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="mt-12">
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <Eyebrow>This month</Eyebrow>
              <p className="font-black text-xl" style={{ fontFamily: FONT }}>
                About <span className="tabular-nums">${MONTHLY_TOTAL}</span> keeps LuffyTV online
              </p>
            </div>
            <p className="text-white/35 text-[13px] max-w-sm">
              Covered out of pocket. Anything donated reduces that — it never
              becomes a requirement.
            </p>
          </div>

          {/* Purely illustrative split of where the money goes. Widths come
              from the real figures above, so this can't drift out of sync. */}
          <div className="flex h-2.5 rounded-full overflow-hidden mt-5 bg-white/[0.06]">
            {COSTS.map((c, i) => (
              <div
                key={c.name}
                title={`${c.name} — ${c.display}`}
                style={{
                  width: `${(c.monthly / MONTHLY_TOTAL) * 100}%`,
                  background: [PINK, CORAL, AMBER, GREEN][i % 4],
                  opacity: 0.85,
                }}
              />
            ))}
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4">
            {COSTS.map((c, i) => (
              <span key={c.name} className="inline-flex items-center gap-2 text-[12px] text-white/45">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: [PINK, CORAL, AMBER, GREEN][i % 4] }}
                />
                {c.name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          3. METHODS
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="mt-14">
        <Eyebrow>Two ways</Eyebrow>
        <SectionTitle>Pick whichever suits you</SectionTitle>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">

          {/* Crypto */}
          <div
            className="relative overflow-hidden rounded-2xl border p-6 flex flex-col"
            style={{ borderColor: `${PINK}40`, background: `linear-gradient(160deg, ${PINK}14 0%, rgba(255,255,255,0.02) 55%)` }}
          >
            <div
              aria-hidden
              className="absolute -top-16 -right-16 w-40 h-40 rounded-full pointer-events-none blur-3xl opacity-30"
              style={{ background: PINK }}
            />
            <span
              className="relative w-12 h-12 rounded-xl grid place-items-center text-white shrink-0"
              style={{ background: PINK, boxShadow: `0 6px 20px ${PINK}55` }}
            >
              {Icon.crypto}
            </span>

            <h3 className="relative font-black text-xl mt-4" style={{ fontFamily: FONT }}>Crypto</h3>
            <p className="relative text-white/45 text-[13px] leading-relaxed mt-1.5">
              One-time. USDT, BTC, ETH, LTC or SOL. No processor in the middle,
              so it can&apos;t be cut off.
            </p>

            <ul className="relative space-y-1.5 mt-4">
              {["No account needed", "No chargebacks", "Works everywhere"].map((t) => (
                <li key={t} className="flex items-center gap-2 text-[13px] text-white/55">
                  <span style={{ color: PINK }}>{Icon.check}</span> {t}
                </li>
              ))}
            </ul>

            <div className="relative mt-5 pt-5 border-t border-white/[0.08]">
              <button
                onClick={goCrypto}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-white text-[#08080c] px-4 py-2.5 text-sm font-bold hover:bg-white/90 transition-colors"
              >
                Addresses &amp; claim {Icon.ext}
              </button>
            </div>
          </div>

          {/* Patreon */}
          <div
            className="relative overflow-hidden rounded-2xl border p-6 flex flex-col"
            style={{ borderColor: `${CORAL}40`, background: `linear-gradient(160deg, ${CORAL}14 0%, rgba(255,255,255,0.02) 55%)` }}
          >
            <div
              aria-hidden
              className="absolute -top-16 -right-16 w-40 h-40 rounded-full pointer-events-none blur-3xl opacity-30"
              style={{ background: CORAL }}
            />
            <span
              className="relative w-12 h-12 rounded-xl grid place-items-center text-white shrink-0"
              style={{ background: CORAL, boxShadow: `0 6px 20px ${CORAL}55` }}
            >
              {Icon.patreon}
            </span>

            <h3 className="relative font-black text-xl mt-4" style={{ fontFamily: FONT }}>Patreon</h3>
            <p className="relative text-white/45 text-[13px] leading-relaxed mt-1.5">
              Monthly, by card or PayPal. Familiar and simple — cancel from your
              own account whenever you want.
            </p>

            <ul className="relative space-y-1.5 mt-4">
              {["Card or PayPal", "Cancel anytime", "Managed by Patreon"].map((t) => (
                <li key={t} className="flex items-center gap-2 text-[13px] text-white/55">
                  <span style={{ color: CORAL }}>{Icon.check}</span> {t}
                </li>
              ))}
            </ul>

            <div className="relative mt-5 pt-5 border-t border-white/[0.08]">
              <a
                href={PATREON_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-white text-[#08080c] px-4 py-2.5 text-sm font-bold hover:bg-white/90 transition-colors"
              >
                Open Patreon {Icon.ext}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          4. WALLETS
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="mt-14">
        <Eyebrow>Wallets</Eyebrow>
        <SectionTitle>Copy an address</SectionTitle>
        <p className="text-white/45 text-sm leading-relaxed mt-3 max-w-2xl">
          Send only on the network shown beside each address. A transfer sent on
          the wrong chain cannot be recovered by anyone, including us.
        </p>

        <div className="space-y-2.5 mt-6">
          {visibleWallets.map((c) => (
            <WalletRow key={c.symbol} coin={c} copied={copied === c.symbol} onCopy={onCopyCoin} />
          ))}
        </div>

        {CRYPTO.length > 2 && (
          <button
            onClick={() => setShowAllWallets((v) => !v)}
            className="mt-3 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-[13px] font-bold text-white/60 hover:text-white hover:bg-white/[0.07] transition-colors"
          >
            <span className={`transition-transform duration-200 ${showAllWallets ? "rotate-180" : ""}`}>
              {Icon.chevron}
            </span>
            {showAllWallets ? "Show fewer" : `Show all ${CRYPTO.length} coins`}
          </button>
        )}

        <div
          className="rounded-xl px-4 py-3.5 mt-5"
          style={{ background: `${AMBER}0f`, border: `1px solid ${AMBER}33` }}
        >
          <p className="text-[13px] leading-relaxed" style={{ color: "#fcd34d" }}>
            Copying an address is not enough on its own — crypto transfers carry
            no name. Submit your transaction ID on the claim page or we will have
            no way to know the donation was yours.
          </p>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          5. HOW IT WORKS
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="mt-14">
        <Eyebrow>How it works</Eyebrow>
        <SectionTitle>Three steps</SectionTitle>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
              <span
                className="w-9 h-9 rounded-xl grid place-items-center font-black text-sm shrink-0"
                style={{ background: PINK, color: "#fff" }}
              >
                {s.n}
              </span>
              <h3 className="font-bold text-[16px] mt-3.5" style={{ fontFamily: FONT }}>{s.title}</h3>
              <p className="text-white/45 text-[13px] leading-relaxed mt-1.5">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          6. SUPPORTER BADGE
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="mt-14">
        <Eyebrow>The thank you</Eyebrow>
        <SectionTitle>Your supporter badge</SectionTitle>
        <p className="text-white/45 text-sm mt-3">
          How your profile looks once we&apos;ve matched your donation.
        </p>

        <div
          className="rounded-2xl border p-5 sm:p-6 mt-6 flex items-center gap-5"
          style={{ borderColor: `${PINK}30`, background: `linear-gradient(90deg, ${PINK}12, transparent)` }}
        >
          <div className="relative shrink-0 w-20 h-20">
            {/* 76% inset so an overlay frame can ring the avatar, matching how
                frames composite on the profile page. */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[76%] h-[76%] z-[1]">
              <div
                className="w-full h-full rounded-full grid place-items-center text-xl font-black overflow-hidden"
                style={{
                  background: `${PINK}29`,
                  color: PINK,
                  boxShadow: showcaseFrame ? "none" : `0 0 0 2px ${PINK}bf, 0 0 18px ${PINK}73`,
                }}
              >
                {user?.avatarImage
                  ? <img src={user.avatarImage} alt="" className="w-full h-full object-cover" />
                  : (user?.username?.[0] || "G").toUpperCase()}
              </div>
            </div>
            {showcaseFrame && (
              <img
                src={showcaseFrame}
                alt=""
                aria-hidden
                className="pointer-events-none absolute inset-0 w-full h-full max-w-none select-none z-[2]"
              />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="font-black text-xl sm:text-2xl truncate"
                style={{ fontFamily: FONT, color: PINK }}
              >
                {user?.name || user?.username || "Guest"}
              </span>
              <span
                className="rounded-md text-[10px] font-black uppercase tracking-wider px-2 py-1 text-white"
                style={{ background: PINK }}
              >
                Supporter
              </span>
              <span
                className="rounded-md text-[10px] font-black uppercase tracking-wider px-2 py-1 text-[#08080c]"
                style={{ background: "linear-gradient(135deg, #fbbf24, #f59e0b)" }}
              >
                VIP
              </span>
            </div>
            <p className="text-white/40 text-sm mt-1 truncate">@{user?.username || "guest"}</p>
            <p className="text-white/30 text-[11px] mt-1.5">
              Exclusive frame · VIP highlight · Discord role
            </p>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          7. PERKS
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="mt-14">
        <Eyebrow>Be clear about it</Eyebrow>
        <SectionTitle>What it does and doesn&apos;t get you</SectionTitle>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">

          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 sm:p-6">
            <div className="flex items-center gap-2.5">
              <span
                className="w-9 h-9 rounded-xl grid place-items-center shrink-0"
                style={{ background: `${PINK}26`, color: PINK }}
              >
                {Icon.star}
              </span>
              <h3 className="font-black text-base" style={{ fontFamily: FONT }}>What you get</h3>
            </div>

            <div className="space-y-4 mt-5">
              {PERKS_GET.map((p) => (
                <div key={p.title} className="flex items-start gap-3">
                  <span className="mt-[3px] shrink-0" style={{ color: PINK }}>{Icon.check}</span>
                  <div className="min-w-0">
                    <p className="font-bold text-[14px]">{p.title}</p>
                    <p className="text-white/40 text-[13px] leading-relaxed mt-0.5">{p.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 sm:p-6">
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl grid place-items-center bg-white/[0.07] text-white/55 shrink-0">
                {Icon.shield}
              </span>
              <h3 className="font-black text-base" style={{ fontFamily: FONT }}>What you don&apos;t</h3>
            </div>

            <div className="space-y-4 mt-5">
              {PERKS_NOT_GET.map((p) => (
                <div key={p.title} className="flex items-start gap-3">
                  <span className="mt-[3px] shrink-0 text-white/25">{Icon.cross}</span>
                  <div className="min-w-0">
                    <p className="font-bold text-[14px] text-white/70">{p.title}</p>
                    <p className="text-white/35 text-[13px] leading-relaxed mt-0.5">{p.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          8. SUPPORTERS WALL
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="mt-14">
        <Eyebrow>Thank you</Eyebrow>
        <SectionTitle>People who chipped in</SectionTitle>

        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 sm:p-6 mt-6">
          {supportersLoading ? (
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-8 w-28 rounded-lg bg-white/[0.04] animate-pulse" />
              ))}
            </div>
          ) : supporters.length === 0 ? (
            /* Honest empty state — no invented names to pad the wall out. */
            <div className="text-center py-8">
              <span
                className="w-12 h-12 rounded-2xl grid place-items-center mx-auto"
                style={{ background: `${PINK}1a`, color: PINK }}
              >
                {Icon.heart}
              </span>
              <p className="font-bold text-[15px] mt-4">No supporters yet</p>
              <p className="text-white/35 text-[13px] mt-1.5 max-w-sm mx-auto leading-relaxed">
                This wall fills in as donations are verified. You could be the
                first name on it.
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {supporters.map((s) => (
                <span
                  key={`${s.name}-${s.at}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[13px] font-bold"
                >
                  <span style={{ color: PINK }}>{Icon.heart}</span>
                  {s.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          9. TRANSPARENCY
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="mt-14">
        <Eyebrow>Transparency</Eyebrow>
        <SectionTitle>Where the money goes</SectionTitle>
        <p className="text-white/45 text-sm leading-relaxed mt-3 max-w-3xl">
          What it costs to keep the site online each month. These are{" "}
          <strong className="text-white font-bold">not paid by you</strong> and
          nobody is expected to cover them — this is here so you can see where
          anything sent actually goes.
        </p>

        <div className="overflow-x-auto mt-6">
          <table className="w-full min-w-[540px] text-left border-collapse">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.14em] text-white/35">
                <th className="font-bold pb-3 pr-4">Item</th>
                <th className="font-bold pb-3 pr-4">Cost</th>
                <th className="font-bold pb-3">What it pays for</th>
              </tr>
            </thead>
            <tbody>
              {COSTS.map((c) => (
                <tr key={c.name} className="border-t border-white/[0.06]">
                  <td className="py-3.5 pr-4 font-bold text-sm whitespace-nowrap">{c.name}</td>
                  <td className="py-3.5 pr-4 text-sm text-white/60 tabular-nums whitespace-nowrap">{c.display}</td>
                  <td className="py-3.5 text-[11px] uppercase tracking-wider text-white/35">{c.use}</td>
                </tr>
              ))}
              <tr className="border-t border-white/[0.14]">
                <td className="py-3.5 pr-4 font-black text-sm">Total</td>
                <td className="py-3.5 pr-4 font-black text-sm tabular-nums whitespace-nowrap">
                  ~${MONTHLY_TOTAL} / month
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-black/30 px-4 py-3.5 mt-5">
          <p className="text-[13px] text-white/50 leading-relaxed">
            <strong className="text-white font-bold">Note:</strong> donations only
            offset part of the above. The site keeps running either way, whether
            or not anyone supports it.
          </p>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          10. FAQ
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="mt-14">
        <Eyebrow>Questions</Eyebrow>
        <SectionTitle>Before you give</SectionTitle>

        <div className="mt-6 border-t border-white/[0.07]">
          {FAQS.map((f, i) => (
            <FaqItem
              key={f.q}
              faq={f}
              open={openFaq === i}
              onToggle={() => setOpenFaq((cur) => (cur === i ? null : i))}
            />
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          11. CLOSING CTA
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="mt-14">
        <div
          className="relative overflow-hidden rounded-2xl border p-6 sm:p-10 text-center"
          style={{
            borderColor: `${PINK}30`,
            background: `radial-gradient(120% 100% at 50% -20%, ${PINK}1f, transparent 65%)`,
          }}
        >
          <h2 className="font-black text-2xl sm:text-3xl tracking-tight" style={{ fontFamily: FONT }}>
            Only if you want to
          </h2>
          <p className="text-white/45 text-sm leading-relaxed mt-3 max-w-lg mx-auto">
            Watching, reading and telling a friend about the site helps just as
            much as money does. No hard feelings either way.
          </p>

          <div className="flex flex-wrap justify-center gap-2.5 mt-7">
            <button
              onClick={goCrypto}
              className="inline-flex items-center gap-2 rounded-xl bg-white text-[#08080c] px-5 py-3 text-sm font-bold hover:bg-white/90 transition-colors"
            >
              {Icon.crypto} Support with crypto
            </button>
            <a
              href={PATREON_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.05] px-5 py-3 text-sm font-bold hover:bg-white/[0.1] transition-colors"
            >
              {Icon.patreon} Patreon {Icon.ext}
            </a>
          </div>

          <button
            onClick={() => navigate({ page: "home" })}
            className="mt-6 text-[13px] font-bold text-white/35 hover:text-white transition-colors"
          >
            No thanks, back to watching
          </button>
        </div>
      </section>
    </div>
  );
}
