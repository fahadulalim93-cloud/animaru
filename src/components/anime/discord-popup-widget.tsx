"use client";

import { useState, useEffect } from "react";

/**
 * Discord Popup Widget — shows on the LEFT side on page load.
 *
 * Behavior:
 *   - Shows immediately on page load (bottom-left corner)
 *   - User can dismiss with "Got it" or X close button
 *   - Uses sessionStorage → dismissal clears on refresh → shows again
 *
 * Design matches LuffyTV dark theme:
 *   - Dark background (#0a0a0a)
 *   - Discord blurple accent (#5865F2)
 *   - Server name + online count + Join button
 */
const SESSION_KEY = "ltv_discord_popup_dismissed";

export default function DiscordPopupWidget() {
  const [visible, setVisible] = useState(false);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    try {
      const dismissed = sessionStorage.getItem(SESSION_KEY);
      if (!dismissed) {
        setVisible(true);
        fetch("/api/discord-widget", { cache: "no-store" })
          .then((r) => r.json())
          .then((d) => setData(d))
          .catch(() => {});
      }
    } catch {
      setVisible(true);
    }
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {}
  };

  if (!visible) return null;

  const serverName = data?.serverName || "LuffyTV";
  const onlineCount = data?.onlineCount;
  const inviteUrl = "https://discord.gg/SdFB3HxDH5";

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes dpSlideIn {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}} />

      {/* Popup on bottom-LEFT side */}
      <div
        className="fixed bottom-4 left-4 z-[9998] hidden lg:block"
        style={{ animation: "dpSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards" }}
      >
        <div className="w-[260px] rounded-xl overflow-hidden border border-white/[0.08] bg-[#0a0a0a] shadow-2xl">
          {/* Close button (X) */}
          <button
            onClick={handleDismiss}
            className="absolute top-2 right-2 z-10 w-5 h-5 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-colors"
            title="Close"
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>

          {/* Header */}
          <div className="px-4 pt-4 pb-3 bg-gradient-to-b from-[#5865F2]/10 to-transparent">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#5865F2] shrink-0">
                <svg viewBox="0 0 24 24" fill="white" width="16" height="16">
                  <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1 pr-5">
                <h3 className="text-sm font-bold text-white leading-tight">{serverName}</h3>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[11px] text-white/50">
                    {onlineCount !== null ? `${onlineCount} online` : "Join the community"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Join Discord button */}
          <div className="p-3">
            <a
              href={inviteUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleDismiss}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-xs font-bold text-white bg-[#5865F2] hover:bg-[#4752C4] transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z" />
              </svg>
              Join Discord
            </a>
          </div>

          {/* Got it dismiss button */}
          <div className="px-3 pb-3">
            <button
              onClick={handleDismiss}
              className="w-full py-1.5 rounded-lg text-[11px] font-medium text-white/40 hover:text-white/70 bg-white/[0.02] hover:bg-white/[0.05] transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
