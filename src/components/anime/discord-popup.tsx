"use client";

import { useEffect, useState, useRef } from "react";

const DISCORD_URL = "https://discord.gg/GEVes3uhtM";

export default function DiscordPopup() {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const styleRef = useRef<HTMLStyleElement | null>(null);

  useEffect(() => {
    // Inject keyframes once
    if (typeof document !== "undefined" && !document.getElementById("dp-keyframes")) {
      const s = document.createElement("style");
      s.id = "dp-keyframes";
      s.textContent = `
        @keyframes dpFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes dpSlideUp { from { opacity: 0; transform: translateY(20px) } to { opacity: 1; transform: translateY(0) } }
      `;
      document.head.appendChild(s);
      styleRef.current = s;
    }

    // Only show once per device
    const dismissed = localStorage.getItem("ltv_discord_popup_dismissed");
    if (dismissed) return;

    const timer = setTimeout(() => setVisible(true), 2200);
    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    setExiting(true);
    setTimeout(() => {
      setVisible(false);
      localStorage.setItem("ltv_discord_popup_dismissed", "1");
    }, 300);
  };

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-[99999] flex items-center justify-center p-4 transition-opacity duration-300 ${
        exiting ? "opacity-0" : "opacity-100"
      }`}
      style={!exiting ? { animation: "dpFadeIn .4s ease forwards" } : undefined}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Card — clean and simple, no crazy glow */}
      <div
        className={`relative z-10 w-full max-w-xs rounded-2xl overflow-hidden border border-white/10 transition-all duration-300 ${
          exiting ? "scale-95 opacity-0" : "scale-100 opacity-100"
        }`}
        style={{
          animation: exiting ? "none" : "dpSlideUp .4s ease forwards",
          background: "#111827",
        }}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-2.5 right-2.5 w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/40 hover:text-white transition-colors z-20"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        <div className="px-5 pt-7 pb-5 text-center">
          {/* Discord icon — simple, no glow */}
          <div className="mx-auto w-12 h-12 rounded-xl flex items-center justify-center mb-4 bg-[#5865F2]">
            <svg viewBox="0 0 24 24" fill="white" width="24" height="24">
              <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z"/>
            </svg>
          </div>

          {/* Title */}
          <h2 className="text-lg font-bold text-white mb-1">
            Join Our Discord
          </h2>

          {/* Subtitle */}
          <p className="text-xs text-white/50 leading-relaxed mb-5">
            50,000+ anime fans. Episode drops, leaks & community.
          </p>

          {/* CTA button — clean, no glow */}
          <a
            href={DISCORD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-lg font-bold text-sm text-white transition-colors bg-[#5865F2] hover:bg-[#4752C4]"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z"/>
            </svg>
            Join Discord
          </a>

          {/* Dismiss hint */}
          <p className="text-[10px] text-white/25 mt-2.5">
            Won&apos;t show again after closing
          </p>
        </div>
      </div>
    </div>
  );
}
