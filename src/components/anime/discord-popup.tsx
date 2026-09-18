"use client";

import { useEffect, useState } from "react";

const DISCORD_URL = "https://discord.gg/SdFB3HxDH5";
const STORAGE_KEY = "ltv_discord_popup_v2"; // bumped v2 → forces reset for everyone
const SHOW_DELAY = 0; // show immediately — was 4500ms
const RESHOW_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

export default function DiscordPopup() {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Migration: clear the OLD storage key so EVERY user (including owner
    // and registered users who already dismissed the old popup) sees it
    // again. After this render, the v2 key takes over.
    try {
      const oldKey = "ltv_discord_popup_ts";
      if (localStorage.getItem(oldKey) !== null) {
        localStorage.removeItem(oldKey);
      }
    } catch {}

    const lastShown = localStorage.getItem(STORAGE_KEY);
    const now = Date.now();
    if (lastShown) {
      const elapsed = now - parseInt(lastShown, 10);
      if (elapsed < RESHOW_INTERVAL) return;
    }
    // SHOW_DELAY = 0 → show on next tick (after first paint)
    const timer = setTimeout(() => setVisible(true), SHOW_DELAY);
    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    setExiting(true);
    setTimeout(() => {
      setVisible(false);
      try { localStorage.setItem(STORAGE_KEY, Date.now().toString()); } catch {}
    }, 250);
  };

  const handleCopyInvite = async () => {
    try {
      await navigator.clipboard.writeText(DISCORD_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select text
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!visible) return null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes dpFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes dpFadeOut { from { opacity: 1 } to { opacity: 0 } }
        @keyframes dpPopIn { from { opacity: 0; transform: scale(0.92) translateY(10px) } to { opacity: 1; transform: scale(1) translateY(0) } }
        @keyframes dpPopOut { from { opacity: 1; transform: scale(1) translateY(0) } to { opacity: 0; transform: scale(0.95) translateY(8px) } }
      `}} />

      {/* Full-screen BLACK overlay */}
      <div
        className="fixed inset-0 z-[99999] flex items-center justify-center p-4"
        style={{
          backgroundColor: "rgba(0,0,0,0.9)",
          animation: exiting ? "dpFadeOut .25s ease forwards" : "dpFadeIn .3s ease forwards",
        }}
        onClick={handleClose}
      >
        {/* Centered BLACK card */}
        <div
          className="relative w-full max-w-[380px] rounded-2xl overflow-hidden border border-white/15 shadow-2xl bg-black"
          style={{
            animation: exiting ? "dpPopOut .25s ease forwards" : "dpPopIn .35s cubic-bezier(0.16, 1, 0.3, 1) forwards",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute top-3 right-3 w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/40 hover:text-white transition-colors z-10"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>

          {/* Discord icon header banner — BLACK (not blue) */}
          <div className="flex justify-center pt-8 pb-4 bg-gradient-to-b from-white/[0.04] to-transparent">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-black border border-white/15 shadow-lg">
              <svg viewBox="0 0 24 24" fill="white" width="28" height="28"><path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z"/></svg>
            </div>
          </div>

          {/* Body */}
          <div className="px-6 pb-6 text-center">
            <h3 className="text-lg font-bold text-white mb-1">Join Our Discord</h3>
            <p className="text-xs text-white/40 mb-3">50,000+ anime fans · Episode drops, leaks & updates</p>
            <p className="text-sm text-white/60 leading-relaxed mb-5">
              Be the first to know when new episodes drop, get leak alerts, and chat with the community.
            </p>

            {/* Three buttons: Join Discord (primary) + Copy invite link + Got it */}
            <div className="flex flex-col gap-2">
              <a
                href={DISCORD_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleClose}
                className="inline-flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm text-white transition-all bg-white hover:bg-white/90 hover:text-black"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z"/></svg>
                Join Discord
              </a>

              {/* Copy invite link button — lets user share with friends */}
              <button
                onClick={handleCopyInvite}
                className="inline-flex items-center justify-center gap-2 py-2.5 rounded-xl font-medium text-xs text-white/80 hover:text-white border border-white/15 hover:border-white/30 bg-transparent hover:bg-white/5 transition-all"
              >
                {copied ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                    Copied! Share with friends
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></svg>
                    Copy invite link for friends
                  </>
                )}
              </button>

              <button
                onClick={handleClose}
                className="py-2 rounded-xl text-xs font-medium text-white/40 hover:text-white/70 transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
