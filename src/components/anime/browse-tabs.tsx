"use client";

import { Compass, Film, BookOpen, Music2 } from "lucide-react";
import { useAppStore } from "./store";

// Shared content-type switcher shown at the top of every Browse-style
// section (Discover, Anime browse, Manga, Music) so navigating between them
// feels like one consistent "Browse" experience instead of disconnected pages.
export default function BrowseTabs({ active }: { active: "discover" | "anime" | "manga" | "music" }) {
  const navigate = useAppStore(s => s.navigate);
  const setSectionSubPage = useAppStore(s => s.setSectionSubPage);

  const tabs = [
    { key: "discover" as const, label: "Discover", icon: Compass, onClick: () => navigate({ page: "discover" }) },
    { key: "anime" as const, label: "Anime", icon: Film, onClick: () => { navigate({ page: "home" }); setSectionSubPage("browse"); } },
    { key: "manga" as const, label: "Manga", icon: BookOpen, onClick: () => { navigate({ page: "manga" }); setSectionSubPage("popular"); } },
    { key: "music" as const, label: "Music", icon: Music2, onClick: () => navigate({ page: "music" }) },
  ];

  return (
    <div className="flex items-center justify-center gap-2.5 flex-wrap pt-[64px] pb-4 px-4">
      {tabs.map(tab => {
        const Icon = tab.icon;
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            onClick={tab.onClick}
            className={`flex items-center gap-2 shrink-0 whitespace-nowrap px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${
              isActive
                ? "bg-white border-white text-black"
                : "bg-[#0a0a0a] border-white/[0.08] text-white/70 hover:border-white/20 hover:text-white"
            }`}
          >
            <Icon size={15} />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
