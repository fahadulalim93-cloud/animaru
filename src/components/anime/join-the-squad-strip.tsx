"use client";

/**
 * JoinTheSquadStrip — pure black, full-bleed, PERMANENT.
 *
 * Design rules (per user feedback):
 *   - NO close button (X) — strip is permanent, cannot be dismissed
 *   - NO colored top border / line — pure black only, flush against hero
 *   - NO seam / cross-section — strip blends into hero's bottom fade
 *   - Theme is BLACK — purple accents live INSIDE the strip (logo, button)
 *     but never as borders or dividers
 *   - Full viewport width; inner content constrained via max-w-screen-2xl
 *
 * Clicking "Join the Squad" opens Discord in a new tab.
 * The strip itself stays visible — users cannot close it.
 */
const DISCORD_INVITE = "https://discord.gg/SdFB3HxDH5";
const INVITE_SHORT = "discord.gg/SdFB3HxDH5";

export default function JoinTheSquadStrip() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes jtssSlideIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes jtssPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(155, 89, 242, 0.35); }
          50%      { box-shadow: 0 0 0 6px rgba(155, 89, 242, 0); }
        }
      `}} />

      {/* Full-bleed pure black. No top border, no gradient — solid #000.
          Negative margin pulls it up into the hero's bottom fade-to-black
          zone so there's NO visible seam or cross-section. PERMANENT —
          no close button, no dismissal logic. */}
      <div
        className="relative -mt-2 z-30 w-full"
        style={{
          animation: "jtssSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards",
          background: "#000000",
        }}
      >
        {/* Inner content — constrained width, full-bleed background */}
        <div className="mx-auto max-w-screen-2xl px-4 md:px-8 lg:px-12">
          <div className="flex items-center gap-3 sm:gap-4 py-3 sm:py-3.5">
            {/* Discord logo — purple gradient circle, glow contained inside */}
            <div
              className="hidden sm:flex shrink-0 w-9 h-9 rounded-full items-center justify-center"
              style={{
                background: "linear-gradient(135deg, #9B59F2 0%, #5865F2 100%)",
                boxShadow: "0 0 14px rgba(155, 89, 242, 0.35)",
              }}
            >
              <svg viewBox="0 0 24 24" fill="white" width="18" height="18">
                <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z" />
              </svg>
            </div>

            {/* Center: labels + message */}
            <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
              {/* COMMUNITY · BETA */}
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className="text-[10px] font-bold tracking-[0.2em] uppercase"
                  style={{ color: "rgba(196, 181, 253, 0.85)" }}
                >
                  Community
                </span>
                <span
                  className="px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider text-white"
                  style={{
                    background: "linear-gradient(135deg, #9B59F2 0%, #5865F2 100%)",
                  }}
                >
                  BETA
                </span>
              </div>
              {/* Message */}
              <p className="text-xs sm:text-sm text-white/55 leading-snug truncate">
                Public profiles are in beta — join Discord for updates, feedback, and drop alerts.
              </p>
            </div>

            {/* Right: Join button — purple gradient, glowing pulse.
                Opens Discord in a new tab. Strip stays visible — no dismissal. */}
            <a
              href={DISCORD_INVITE}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-2 shrink-0 pl-3 pr-4 py-2 rounded-lg text-xs font-bold text-white transition-all"
              style={{
                background: "linear-gradient(135deg, #9B59F2 0%, #7C3AED 100%)",
                animation: "jtssPulse 2.5s ease-in-out infinite",
              }}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
                <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z" />
              </svg>
              <span className="flex items-baseline gap-1.5">
                <span>Join the Squad</span>
                <span className="text-[10px] font-medium text-white/70 hidden md:inline">{INVITE_SHORT}</span>
              </span>
            </a>

            {/* Mobile-only join button (smaller) */}
            <a
              href={DISCORD_INVITE}
              target="_blank"
              rel="noopener noreferrer"
              className="sm:hidden flex items-center gap-1 shrink-0 px-2.5 py-1.5 rounded-md text-[11px] font-bold text-white"
              style={{ background: "linear-gradient(135deg, #9B59F2 0%, #7C3AED 100%)" }}
            >
              Join
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
