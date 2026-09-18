// src/components/Sidebar.tsx
"use client";
import { Home, Search, Calendar, User, Download, Music, Heart, Settings, LogOut } from "lucide-react";
import { clsx } from "clsx";

const navItems = [
  { icon: Home, label: "Home", active: true },
  { icon: Search, label: "Search" },
  { icon: Calendar, label: "Schedule" },
  { icon: User, label: "Profile" },
  { icon: Download, label: "Downloads" },
  { icon: Music, label: "Music" },
];

const bottomItems = [
  { icon: Heart, label: "Favorites", color: "text-red-500" },
  { icon: Settings, label: "Settings" },
  { icon: LogOut, label: "Exit" },
];

export default function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 h-screen w-[72px] bg-[#0f0f0f] flex flex-col items-center py-4 z-50 border-r border-white/[0.05]">
      {/* Logo */}
      <div className="mb-6">
        <div className="w-9 h-9 flex items-center justify-center">
          <svg viewBox="0 0 32 32" className="w-8 h-8" fill="white">
            <path d="M16 2L4 8v8c0 6 5 11 12 14 7-3 12-8 12-14V8L16 2z" opacity="0.9"/>
            <path d="M16 6L8 10v6c0 4 3 8 8 10 5-2 8-6 8-10v-6L16 6z" fill="#0f0f0f"/>
            <path d="M16 9l-5 3v4c0 3 2 5 5 7 3-2 5-4 5-7v-4l-5-3z" fill="white"/>
          </svg>
        </div>
      </div>

      {/* Nav Items */}
      <nav className="flex flex-col gap-2 flex-1">
        {navItems.map((item) => (
          <button
            key={item.label}
            className={clsx(
              "w-10 h-10 rounded-lg flex items-center justify-center transition-all",
              item.active
                ? "bg-white/10 text-white"
                : "text-gray-500 hover:bg-white/5 hover:text-white"
            )}
            title={item.label}
          >
            <item.icon size={20} strokeWidth={1.5} />
          </button>
        ))}
      </nav>

      {/* Bottom Items */}
      <div className="flex flex-col gap-2 pb-2">
        {bottomItems.map((item) => (
          <button
            key={item.label}
            className={clsx(
              "w-10 h-10 rounded-lg flex items-center justify-center transition-all text-gray-500 hover:bg-white/5 hover:text-white",
              item.color && item.color
            )}
            title={item.label}
          >
            <item.icon size={20} strokeWidth={1.5} />
          </button>
        ))}
      </div>
    </aside>
  );
}
