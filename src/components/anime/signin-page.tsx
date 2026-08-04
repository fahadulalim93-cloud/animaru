"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useAppStore } from "./store";
import { signIn, checkAccountStatus } from "@/lib/auth-local";
import CinematicBackdrop from "./cinematic-backdrop";

const FONT = "var(--font-space-grotesk), 'Space Grotesk', sans-serif";
const ACCENT = "#1E88FF";

const COMMUNITY_PERKS = [
  {
    title: "Continue Watching",
    desc: "Pick up exactly where you left off, on any device.",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>
    ),
  },
  {
    title: "Bookmarks & History",
    desc: "Save titles and revisit your watch history anytime.",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
    ),
  },
  {
    title: "Comment on Anime",
    desc: "Share your thoughts and reviews with the community.",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" /></svg>
    ),
  },
  {
    title: "Zero Ads, Always",
    desc: "No paywalls, no interruptions — just press play.",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M13 2 3 14h7l-1 8 11-14h-7l1-6z" /></svg>
    ),
  },
];

/**
 * SignInPage — cinematic account-access screen, matching the rest of the
 * site's black/blue system. Split layout: hero headline over the shared
 * particle backdrop, then a two-column body — community perks left, the
 * actual sign-in panel right (solid, no glass, per site style rules).
 */
export default function SignInPage() {
  const navigate = useAppStore((s) => s.navigate);
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) navigate({ page: "profile" });
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    await new Promise((r) => setTimeout(r, 400));
    const result = signIn({ identifier, password });
    if (result.ok) {
      const status = await checkAccountStatus(result.user.username);
      setLoading(false);
      if (status.blocked) {
        setError(status.message);
        return;
      }
      setUser(result.user);
      navigate({ page: "profile" });
    } else {
      setLoading(false);
      setError(result.error);
    }
  };

  const focusStyle = (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = `${ACCENT}80`; e.currentTarget.style.background = "rgba(255,255,255,0.08)"; };
  const blurStyle = (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = ""; e.currentTarget.style.background = ""; };

  return (
    <div className="ltv-cine-root w-full min-h-screen text-white overflow-x-hidden" style={{ fontFamily: "var(--font-inter), Inter, sans-serif" }}>
      <CinematicBackdrop particleCount={22} />

      {/* Minimal top bar — logo + back to browsing */}
      <header className="relative z-10 flex items-center justify-between px-6 lg:px-10 pt-7">
        <button onClick={() => navigate({ page: "home" })} className="flex items-center gap-2.5" aria-label="LuffyTV">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${ACCENT}22`, border: `1px solid ${ACCENT}55` }}>
            <svg className="w-4.5 h-4.5" style={{ color: ACCENT }} viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
          </div>
          <span className="text-lg font-bold" style={{ fontFamily: FONT }}>
            LUFFY <span style={{ color: ACCENT }}>TV</span>
          </span>
        </button>
        <button
          onClick={() => navigate({ page: "home" })}
          className="hidden sm:inline-flex items-center gap-1.5 text-xs font-bold text-white/40 hover:text-white transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          Back to browsing
        </button>
      </header>

      {/* ═══ Hero headline ═══ */}
      <section className="relative z-10 flex flex-col items-center text-center px-6 pt-14 sm:pt-20 pb-10 sm:pb-14">
        <motion.span
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="ltv-cine-eyebrow inline-block text-xs font-bold uppercase px-3 py-1.5 rounded-full border border-[#1E88FF]/25 bg-[#1E88FF]/[0.06] mb-6"
        >
          Account Access
        </motion.span>
        <motion.h1
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="ltv-cine-gradient-text font-black leading-[0.98] tracking-tight text-4xl sm:text-5xl xl:text-6xl"
          style={{ fontFamily: FONT }}
        >
          Welcome back.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.22 }}
          className="text-[#a1a7b3] text-sm sm:text-base max-w-md mt-5"
        >
          Enter your details to access your account and continue watching.
        </motion.p>
      </section>

      {/* ═══ Body: community perks + form ═══ */}
      <section className="relative z-10 px-6 lg:px-10 pb-20">
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-14 items-start">
          {/* Community perks */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="order-2 lg:order-1 pt-2 lg:pt-6"
          >
            <span className="ltv-cine-eyebrow text-xs font-bold uppercase block mb-3">Join our Community</span>
            <h2 className="text-2xl sm:text-3xl font-black mb-3" style={{ fontFamily: FONT }}>
              Welcome to our community.
            </h2>
            <p className="text-sm text-[#a1a7b3] leading-relaxed mb-8 max-w-sm">
              Sign in to unlock everything that makes LuffyTV feel like home — synced progress, saved titles, and a place to talk anime with people who actually watch it.
            </p>
            <div className="space-y-5">
              {COMMUNITY_PERKS.map((perk, i) => (
                <motion.div
                  key={perk.title}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.4 + i * 0.08 }}
                  className="flex items-start gap-3.5"
                >
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(30,136,255,0.10)", color: ACCENT }}>
                    {perk.icon}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{perk.title}</p>
                    <p className="text-xs text-[#767d8a] mt-0.5">{perk.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
            <div className="ltv-cine-hairline my-8 max-w-sm ml-0" />
            <a
              href="https://discord.gg/GEVes3uhtM"
              target="_blank"
              rel="noopener noreferrer"
              className="ltv-cine-btn-secondary inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-xs"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z"/>
              </svg>
              50,000+ fans on Discord
            </a>
          </motion.div>

          {/* Form panel */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="order-1 lg:order-2 ltv-cine-surface rounded-3xl p-7 sm:p-9 w-full"
          >
            {/* Tab toggle */}
            <div className="flex items-center gap-1 p-1 rounded-full bg-white/[0.04] border border-white/10 mb-7">
              <span
                className="flex-1 text-center py-2 rounded-full text-xs font-bold"
                style={{ background: ACCENT, color: "#fff" }}
              >
                Login
              </span>
              <button
                onClick={() => navigate({ page: "signup" })}
                className="flex-1 text-center py-2 rounded-full text-xs font-bold text-white/50 hover:text-white transition-colors"
              >
                Sign Up
              </button>
            </div>

            {error && (
              <div className="mb-5 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-2.5">
                <svg className="w-4 h-4 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-white/50 uppercase tracking-wider mb-2">
                  Username or Email
                </label>
                <div className="relative">
                  <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="luffy or luffy@op.com"
                    autoComplete="username"
                    autoFocus
                    className="w-full pl-11 pr-4 py-3 rounded-xl bg-white/[0.05] border border-white/10 text-sm text-white placeholder-white/20 outline-none transition-all"
                    onFocus={focusStyle}
                    onBlur={blurStyle}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-white/50 uppercase tracking-wider">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => alert("Password reset is not available in this demo. Contact the admin.")}
                    className="text-xs text-white/40 hover:text-white/70 transition-colors"
                  >
                    Forgot?
                  </button>
                </div>
                <div className="relative">
                  <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="w-full pl-11 pr-11 py-3 rounded-xl bg-white/[0.05] border border-white/10 text-sm text-white placeholder-white/20 outline-none transition-all"
                    onFocus={focusStyle}
                    onBlur={blurStyle}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                  >
                    {showPassword ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="w-4 h-4 rounded border-white/20 bg-white/5"
                  style={{ accentColor: ACCENT }}
                />
                <span className="text-xs text-white/50">Keep me signed in on this device</span>
              </label>

              <button
                type="submit"
                disabled={loading || !identifier.trim() || !password}
                className="ltv-cine-btn-primary w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign in
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </>
                )}
              </button>
            </form>

            <p className="mt-6 text-[10px] text-white/25 text-center leading-relaxed">
              By signing in you agree to our Terms of Service and acknowledge our Privacy Policy.
              <br />This is a fan-made project for educational purposes.
            </p>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
