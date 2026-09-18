"use client";

import { useState, useEffect } from "react";

/**
 * Discord Community Sidebar Widget
 * Shows server name, online member count, and a Join button.
 * Positioned as a right sidebar on the main page (like comico.moe).
 */
export default function DiscordSidebar() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/discord-widget", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setData({
            serverName: "LuffyTV",
            inviteUrl: "https://discord.gg/SdFB3HxDH5",
            onlineCount: null,
            members: [],
          });
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="hidden xl:flex flex-col w-[280px] shrink-0 sticky top-20 self-start">
        <div className="rounded-2xl border border-white/[0.06] bg-black/40 backdrop-blur p-4 animate-pulse h-[300px]" />
      </div>
    );
  }

  const serverName = data?.serverName || "LuffyTV";
  const serverIcon = data?.serverIcon;
  const inviteUrl = data?.inviteUrl || "https://discord.gg/SdFB3HxDH5";
  const onlineCount = data?.onlineCount;
  const members = data?.members || [];

  return (
    <div className="hidden xl:flex flex-col w-[280px] shrink-0 sticky top-20 self-start">
      <div className="rounded-2xl border border-white/[0.06] bg-black/40 backdrop-blur overflow-hidden">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-white/[0.06]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold tracking-widest text-white/40">
              DISCORD COMMUNITY
            </span>
            <a
              href={inviteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1 rounded-md text-[10px] font-bold text-black bg-white hover:bg-white/90 transition-colors"
            >
              Join
            </a>
          </div>
          <div className="flex items-center gap-2.5">
            {serverIcon ? (
              <img
                src={serverIcon}
                alt={serverName}
                className="w-9 h-9 rounded-full"
                width={36}
                height={36}
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-[#5865F2] flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="white" width="18" height="18">
                  <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z" />
                </svg>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-white truncate">{serverName}</h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[11px] text-white/50">
                  {onlineCount !== null
                    ? `${onlineCount} online`
                    : "Join the community"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Channel indicator */}
        <div className="px-4 py-2.5">
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/[0.04] text-[10px] font-medium text-white/50">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5.887 8H10.103L10.886 4.024C10.973 3.61 11.358 3.335 11.781 3.387C12.204 3.44 12.509 3.803 12.509 4.229V4.266L11.727 8.182C11.679 8.474 11.727 8.671 11.871 8.858C12.014 9.045 12.234 9.152 12.471 9.152H16.801L17.608 5.024C17.695 4.61 18.08 4.335 18.503 4.387C18.926 4.44 19.231 4.803 19.231 5.229V5.266L18.449 9.182C18.401 9.474 18.449 9.671 18.593 9.858C18.736 10.045 18.956 10.152 19.193 10.152H20.633C21.009 10.152 21.313 10.457 21.313 10.832C21.313 11.208 21.009 11.512 20.633 11.512H18.853C18.439 11.512 18.083 11.807 17.999 12.212L17.193 16.488H12.977L12.193 20.464C12.107 20.878 11.721 21.153 11.298 21.101C10.875 21.048 10.571 20.685 10.571 20.259V20.222L11.353 16.306C11.401 16.014 11.353 15.817 11.209 15.63C11.065 15.443 10.845 15.336 10.608 15.336H6.278L5.471 19.464C5.385 19.878 4.999 20.153 4.576 20.101C4.153 20.048 3.849 19.685 3.849 19.259V19.222L4.631 15.306C4.679 15.014 4.631 14.817 4.487 14.63C4.343 14.443 4.123 14.336 3.886 14.336H2.447C2.071 14.336 1.767 14.032 1.767 13.656C1.767 13.28 2.071 12.976 2.447 12.976H4.227C4.641 12.976 4.997 12.681 5.081 12.276L5.887 8ZM7.351 12.976H10.767C11.181 12.976 11.537 12.681 11.621 12.276L12.293 9.152H8.877C8.463 9.152 8.107 9.447 8.023 9.852L7.351 12.976Z" />
            </svg>
            #general
          </span>
        </div>

        {/* Online members list */}
        {members.length > 0 && (
          <div className="px-3 pb-3 max-h-[200px] overflow-y-auto scrollbar-thin">
            <div className="space-y-1">
              {members.map((m: any, i: number) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-white/[0.03] transition-colors"
                >
                  {m.avatar ? (
                    <img
                      src={m.avatar}
                      alt={m.username}
                      className="w-6 h-6 rounded-full"
                      width={24}
                      height={24}
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-white/40">
                      {m.username?.charAt(0)?.toUpperCase() || "?"}
                    </div>
                  )}
                  <span className="text-[11px] text-white/70 truncate flex-1">
                    {m.username}
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bottom join button (large) */}
        <div className="p-3 border-t border-white/[0.06]">
          <a
            href={inviteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-xs font-bold text-white bg-[#5865F2] hover:bg-[#4752C4] transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
              <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z" />
            </svg>
            Join Discord
          </a>
        </div>
      </div>
    </div>
  );
}
