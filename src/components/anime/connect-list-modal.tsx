"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "./store";
import { getAniListAuthUrl, isAniListConfigured } from "@/lib/anilist-auth";
import { isMalConfigured, startMalAuth } from "@/lib/mal-auth";

// Shown when a signed-in user clicks "+" (add to list) but hasn't linked
// AniList or MAL yet — a focused prompt (no email/password form, they're
// already signed in) offering the two connect options.
export default function ConnectListModal() {
  const open = useAppStore((s) => s.connectListModalOpen);
  const close = useAppStore((s) => s.closeConnectListModal);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", handler);
    };
  }, [open, close]);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-[200] flex items-center justify-center p-4"
        style={{ background: "rgba(0, 0, 0, 0.85)" }}
        onClick={close}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 12 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-[360px] rounded-2xl overflow-hidden"
          style={{ background: "#000000", boxShadow: "0 20px 60px -15px rgba(0,0,0,0.9)" }}
        >
          <button
            onClick={close}
            aria-label="Close"
            className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>

          <div className="px-6 pt-7 pb-6">
            <div className="mb-5">
              <h2 className="text-xl font-bold text-white tracking-tight">Sign In</h2>
              <p className="text-xs text-white/40 mt-1">Please sign in to edit your list.</p>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => {
                  if (isAniListConfigured()) window.location.href = getAniListAuthUrl();
                }}
                className="w-full py-2.5 rounded-lg flex items-center justify-center gap-2 text-xs font-semibold text-white/90 transition-all hover:bg-white/5"
                style={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style={{ color: "#02A9FF" }}>
                  <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm-.102 5.6c1.566 0 2.834.39 3.804 1.17.97.78 1.455 1.81 1.455 3.09 0 2.08-1.085 3.432-3.255 4.056l-2.862.84c-.69.21-1.155.405-1.395.585-.24.18-.36.405-.36.675 0 .33.135.585.405.765.27.18.66.27 1.17.27.69 0 1.275-.165 1.725-.495.45-.33.765-.795.945-1.395l3.045.84c-.39 1.32-1.155 2.34-2.295 3.06-1.14.72-2.55 1.08-4.23 1.08-1.77 0-3.18-.39-4.23-1.17-1.05-.78-1.575-1.86-1.575-3.24 0-2.04 1.065-3.39 3.195-4.05l3.06-.93c.69-.21 1.155-.405 1.395-.585.24-.18.36-.42.36-.72 0-.33-.135-.585-.405-.765-.27-.18-.66-.27-1.17-.27-.69 0-1.275.165-1.725.495-.45.33-.765.795-.945 1.395l-3.045-.84c.39-1.32 1.155-2.34 2.295-3.06 1.14-.72 2.55-1.08 4.23-1.08z"/>
                </svg>
                Sign In with AniList
              </button>

              <button
                onClick={() => {
                  if (isMalConfigured()) startMalAuth();
                }}
                className="w-full py-2.5 rounded-lg flex items-center justify-center gap-2 text-xs font-semibold text-white/90 transition-all hover:bg-white/5"
                style={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style={{ color: "#2E51A2" }}>
                  <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 4.5c2.25 0 4.275.93 5.7 2.4h-2.55c-1.05-.6-2.25-.9-3.525-.9-3.75 0-6.75 3-6.75 6.75s3 6.75 6.75 6.75c2.85 0 5.25-1.725 6.225-4.2h-3.15c-.45.6-1.2 1.05-2.1 1.05-1.5 0-2.7-1.2-2.7-2.7s1.2-2.7 2.7-2.7c.9 0 1.65.45 2.1 1.05h3.75c-.6-2.4-2.85-4.05-5.4-4.05-3 0-5.4 2.4-5.4 5.4s2.4 5.4 5.4 5.4c1.5 0 2.85-.6 3.825-1.65h2.55C16.275 19.05 14.25 20.4 12 20.4c-4.65 0-8.4-3.75-8.4-8.4S7.35 4.5 12 4.5z"/>
                </svg>
                Sign In with MyAnimeList
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
