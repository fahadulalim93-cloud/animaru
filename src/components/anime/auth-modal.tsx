"use client";

import { useState, useEffect, useRef, forwardRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "./store";
import { checkAccountStatus, signInWithGoogleProfile } from "@/lib/auth-local";
import { getAniListAuthUrl, isAniListConfigured } from "@/lib/anilist-auth";
import { isGoogleConfigured, signInWithGoogle } from "@/lib/google-auth";

/**
 * AuthModal — minimal, pure-black, compact modal overlay for sign-in / sign-up.
 *
 * Per user request (2026-07-19):
 *   "can you make it little bit good and perfect hunderd person joom it
 *    looks kinda bad can you make it putre black and smaller"
 *
 * Design goals:
 *   - PURE BLACK modal card (#000000) — no gradients, no glass, no borders
 *   - SMALLER (max-width 360px — was 440px)
 *   - TIGHTER spacing (px-6 py-7 — was px-9 py-9)
 *   - Smaller header (text-xl — was text-2xl)
 *   - Cleaner inputs (no border, subtle bg only)
 *   - Tighter social buttons (py-2.5 — was py-3)
 *   - No icon in the header (just title + subtitle)
 *   - Subtle hairline separators instead of borders everywhere
 */

const ACCENT = "#1E88FF";

export default function AuthModal() {
  const authModal = useAppStore((s) => s.authModal);
  const openAuthModal = useAppStore((s) => s.openAuthModal);
  const closeAuthModal = useAppStore((s) => s.closeAuthModal);
  const setUser = useAppStore((s) => s.setUser);

  // ── Form state ──
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Sign-up only
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const identifierRef = useRef<HTMLInputElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);

  // Reset form state when modal opens / mode changes
  useEffect(() => {
    if (authModal) {
      setError("");
      setIdentifier("");
      setPassword("");
      setUsername("");
      setEmail("");
      setConfirmPassword("");
      setShowPassword(false);
      setShowConfirmPassword(false);
      setTimeout(() => {
        if (authModal.mode === "signin") identifierRef.current?.focus();
        else usernameRef.current?.focus();
      }, 100);
    }
  }, [authModal?.mode, authModal]);

  // Lock body scroll while modal is open
  useEffect(() => {
    if (authModal) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [authModal]);

  // Close on Escape key
  useEffect(() => {
    if (!authModal) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAuthModal();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [authModal, closeAuthModal]);

  if (!authModal) return null;

  const isSignIn = authModal.mode === "signin";

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    await new Promise((r) => setTimeout(r, 400));
    // Server-side login (Prisma + HTTP-only session cookie) — works across
    // browsers and incognito. The old localStorage-based signIn() from
    // auth-local.ts was per-browser only, so users couldn't log in from
    // a different browser or incognito window.
    try {
      const res = await fetch("/api/users/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: identifier, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setLoading(false);
        setError(data.error || "Invalid credentials");
        return;
      }
      const status = await checkAccountStatus(data.user.username);
      setLoading(false);
      if (status.blocked) { setError(status.message); return; }
      setUser(data.user);
      useAppStore.getState().setAuthNotice({
        type: "success",
        message: `Welcome back, ${data.user.name || data.user.username}!`,
      });
    } catch (err: any) {
      setLoading(false);
      setError(err?.message || "Network error. Please try again.");
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    await new Promise((r) => setTimeout(r, 400));
    // Server-side signup (Prisma + HTTP-only session cookie) — works across
    // browsers and incognito.
    try {
      const res = await fetch("/api/users/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password, name: username }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setLoading(false);
        setError(data.error || "Registration failed");
        return;
      }
      const status = await checkAccountStatus(data.user.username);
      setLoading(false);
      if (status.blocked) { setError(status.message); return; }
      setUser(data.user);
      useAppStore.getState().setAuthNotice({
        type: "success",
        message: `Welcome to LuffyTV, ${data.user.name || data.user.username}! Your account is ready.`,
      });
    } catch (err: any) {
      setLoading(false);
      setError(err?.message || "Network error. Please try again.");
    }
  };

  const handleGoogleSignIn = async () => {
    if (!isGoogleConfigured()) { setError("Google sign-in is not configured."); return; }
    setError("");
    setLoading(true);
    try {
      const profile = await signInWithGoogle();
      const result = signInWithGoogleProfile(profile);
      if (!result.ok) { setError(result.error); setLoading(false); return; }
      const status = await checkAccountStatus(result.user.username);
      setLoading(false);
      if (status.blocked) { setError(status.message); return; }
      setUser(result.user);
    } catch (err: any) {
      setLoading(false);
      setError(err?.message || "Google sign-in failed.");
    }
  };

  const switchMode = (mode: "signin" | "signup") => {
    setError("");
    openAuthModal(mode);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-[200] flex items-center justify-center p-4"
        style={{ background: "rgba(0, 0, 0, 0.85)" }}
        onClick={closeAuthModal}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 12 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-[360px] rounded-2xl overflow-hidden"
          style={{
            background: "#000000",
            boxShadow: "0 20px 60px -15px rgba(0,0,0,0.9)",
          }}
        >
          {/* ── Close button ── */}
          <button
            onClick={closeAuthModal}
            aria-label="Close"
            className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>

          {/* ── Modal body ── */}
          <div className="px-6 pt-7 pb-6">
            {/* Header — compact */}
            <div className="mb-5">
              <h2 className="text-xl font-bold text-white tracking-tight">
                {isSignIn ? "Sign in" : "Create account"}
              </h2>
              <p className="text-xs text-white/40 mt-1">
                {isSignIn
                  ? "Access your anime collection"
                  : "Join the anime community"}
              </p>
            </div>

            {/* Optional message */}
            {authModal.message && (
              <div className="mb-4 px-3 py-2 rounded-lg bg-[#1E88FF]/10 border border-[#1E88FF]/25 flex items-start gap-2">
                <svg className="w-3.5 h-3.5 text-[#1E88FF] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-[11px] text-[#1E88FF] leading-relaxed">{authModal.message}</p>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/25 flex items-start gap-2">
                <svg className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-xs text-red-300 leading-relaxed">{error}</p>
              </div>
            )}

            {/* ── Form ── */}
            <form onSubmit={isSignIn ? handleSignIn : handleSignUp} className="space-y-2.5">
              {isSignIn ? (
                <>
                  <InputField
                    ref={identifierRef}
                    type="text"
                    value={identifier}
                    onChange={setIdentifier}
                    placeholder="Email or username"
                    autoComplete="username"
                    icon={<EnvelopeIcon />}
                  />
                  <InputField
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={setPassword}
                    placeholder="Password"
                    autoComplete="current-password"
                    icon={<LockIcon />}
                    trailing={
                      <PasswordToggle on={showPassword} onClick={() => setShowPassword(s => !s)} />
                    }
                  />
                </>
              ) : (
                <>
                  <InputField
                    ref={usernameRef}
                    type="text"
                    value={username}
                    onChange={setUsername}
                    placeholder="Username"
                    autoComplete="username"
                    icon={<UserIcon />}
                  />
                  <InputField
                    type="email"
                    value={email}
                    onChange={setEmail}
                    placeholder="Email address"
                    autoComplete="email"
                    icon={<EnvelopeIcon />}
                  />
                  <InputField
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={setPassword}
                    placeholder="Password (min 6 chars)"
                    autoComplete="new-password"
                    icon={<LockIcon />}
                    trailing={
                      <PasswordToggle on={showPassword} onClick={() => setShowPassword(s => !s)} />
                    }
                  />
                  <InputField
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    placeholder="Confirm password"
                    autoComplete="new-password"
                    icon={<LockIcon />}
                    trailing={
                      <PasswordToggle on={showConfirmPassword} onClick={() => setShowConfirmPassword(s => !s)} />
                    }
                  />
                </>
              )}

              {/* Primary action button — pure white, compact */}
              <button
                type="submit"
                disabled={loading || (isSignIn ? (!identifier.trim() || !password) : (!username.trim() || !email.trim() || !password || !confirmPassword))}
                className="w-full mt-1.5 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90"
                style={{ background: "#ffffff", color: "#000000" }}
              >
                {loading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    {isSignIn ? "Signing in..." : "Creating..."}
                  </>
                ) : (
                  <>
                    {isSignIn ? "Sign in" : "Create account"}
                  </>
                )}
              </button>
            </form>

            {/* Forgot password — sign-in mode only */}
            {isSignIn && (
              <div className="text-center mt-3">
                <button
                  type="button"
                  onClick={() => alert("Password reset is not available in this demo.")}
                  className="text-[11px] text-white/40 hover:text-white/70 transition-colors"
                >
                  Forgot password?
                </button>
              </div>
            )}

            {/* Switch mode */}
            <div className="text-center mt-4 text-[11px] text-white/40">
              {isSignIn ? (
                <>
                  No account?{" "}
                  <button onClick={() => switchMode("signup")} className="text-white font-semibold hover:underline">
                    Sign up
                  </button>
                </>
              ) : (
                <>
                  Have an account?{" "}
                  <button onClick={() => switchMode("signin")} className="text-white font-semibold hover:underline">
                    Sign in
                  </button>
                </>
              )}
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-white/8" />
              <span className="text-[9px] uppercase tracking-widest text-white/25 font-bold">or</span>
              <div className="flex-1 h-px bg-white/8" />
            </div>

            {/* Social login — compact dark buttons */}
            <div className="space-y-2">
              <button
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full py-2.5 rounded-lg flex items-center justify-center gap-2 text-xs font-semibold text-white/90 transition-all hover:bg-white/5 disabled:opacity-50"
                style={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <svg viewBox="0 0 24 24" width="14" height="14">
                  <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.53 5.53 0 01-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.82z" />
                  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.94-2.9l-3.88-3.01c-1.08.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.11A12 12 0 0012 24z" />
                  <path fill="#FBBC05" d="M5.27 14.28A7.2 7.2 0 014.9 12c0-.79.14-1.56.37-2.28V6.61H1.27A12 12 0 000 12c0 1.94.46 3.77 1.27 5.39l4-3.11z" />
                  <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.27 6.61l4 3.11C6.22 6.86 8.87 4.75 12 4.75z" />
                </svg>
                Continue with Google
              </button>
              <button
                onClick={() => {
                  if (isAniListConfigured()) window.location.href = getAniListAuthUrl();
                  else setError("AniList login is not configured.");
                }}
                className="w-full py-2.5 rounded-lg flex items-center justify-center gap-2 text-xs font-semibold text-white/90 transition-all hover:bg-white/5"
                style={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style={{ color: "#02A9FF" }}>
                  <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm-.102 5.6c1.566 0 2.834.39 3.804 1.17.97.78 1.455 1.81 1.455 3.09 0 2.08-1.085 3.432-3.255 4.056l-2.862.84c-.69.21-1.155.405-1.395.585-.24.18-.36.405-.36.675 0 .33.135.585.405.765.27.18.66.27 1.17.27.69 0 1.275-.165 1.725-.495.45-.33.765-.795.945-1.395l3.045.84c-.39 1.32-1.155 2.34-2.295 3.06-1.14.72-2.55 1.08-4.23 1.08-1.77 0-3.18-.39-4.23-1.17-1.05-.78-1.575-1.86-1.575-3.24 0-2.04 1.065-3.39 3.195-4.05l3.06-.93c.69-.21 1.155-.405 1.395-.585.24-.18.36-.42.36-.72 0-.33-.135-.585-.405-.765-.27-.18-.66-.27-1.17-.27-.69 0-1.275.165-1.725.495-.45.33-.765.795-.945 1.395l-3.045-.84c.39-1.32 1.155-2.34 2.295-3.06 1.14-.72 2.55-1.08 4.23-1.08z"/>
                </svg>
                Continue with AniList
              </button>
            </div>

            {/* Footer — minimal */}
            <p className="mt-4 text-[10px] text-white/25 text-center">
              {isSignIn
                ? "Sync your anime progress across platforms"
                : "Free forever — sync progress across platforms"}
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Compact input field — no border, subtle bg, smaller padding ────────────

interface InputFieldProps {
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoComplete?: string;
  icon: React.ReactNode;
  trailing?: React.ReactNode;
}

const InputField = forwardRef<HTMLInputElement, InputFieldProps>(
  function InputField(
    { type, value, onChange, placeholder, autoComplete, icon, trailing },
    ref
  ) {
    const [focused, setFocused] = useState(false);
    return (
      <div
        className="relative rounded-lg transition-all ltv-auth-input-wrap"
        style={{
          background: focused ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.03)",
          boxShadow: focused ? `inset 0 0 0 1px ${ACCENT}66` : "inset 0 0 0 1px rgba(255,255,255,0.06)",
        }}
      >
        <div className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none">
          {icon}
        </div>
        <input
          ref={ref}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="w-full pl-9 pr-9 py-2.5 bg-transparent text-sm text-white placeholder-white/30 outline-none ltv-auth-input"
        />
        {trailing && <div className="absolute right-3 top-1/2 -translate-y-1/2">{trailing}</div>}
      </div>
    );
  }
);

// ─── Icons ──────────────────────────────────────────────────────────────────

function EnvelopeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}

function PasswordToggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-white/30 hover:text-white/60 transition-colors"
      tabIndex={-1}
    >
      {on ? (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      )}
    </button>
  );
}
