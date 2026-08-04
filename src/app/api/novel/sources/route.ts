import { NextResponse } from "next/server";

// ============================================================
// NOVEL SOURCES — Returns available novel sources/plugins
// Similar to LNReader/Tsundoku source repos
// ============================================================

interface NovelSource {
  id: string;
  name: string;
  lang: string;
  icon: string;
  url: string;
  type: "light-novel" | "web-novel" | "mixed";
  supportsSearch: boolean;
  supportsLatest: boolean;
  supportsGenres: boolean;
}

const sources: NovelSource[] = [
  {
    id: "readlightnovel",
    name: "ReadLightNovel",
    lang: "English",
    icon: "📖",
    url: "https://readlightnovels.net",
    type: "light-novel",
    supportsSearch: true,
    supportsLatest: true,
    supportsGenres: true,
  },
  {
    id: "novelfull",
    name: "NovelFull",
    lang: "English",
    icon: "📚",
    url: "https://novelfull.com",
    type: "web-novel",
    supportsSearch: true,
    supportsLatest: true,
    supportsGenres: true,
  },
  {
    id: "royalroad",
    name: "RoyalRoad",
    lang: "English",
    icon: "👑",
    url: "https://royalroad.com",
    type: "web-novel",
    supportsSearch: true,
    supportsLatest: true,
    supportsGenres: true,
  },
  {
    id: "scribblehub",
    name: "ScribbleHub",
    lang: "English",
    icon: "✍️",
    url: "https://scribblehub.com",
    type: "web-novel",
    supportsSearch: true,
    supportsLatest: true,
    supportsGenres: true,
  },
  {
    id: "novelupdates",
    name: "NovelUpdates",
    lang: "English",
    icon: "🔄",
    url: "https://novelupdates.com",
    type: "mixed",
    supportsSearch: true,
    supportsLatest: true,
    supportsGenres: true,
  },
  {
    id: "wuxiaworld",
    name: "WuxiaWorld",
    lang: "English",
    icon: "⚔️",
    url: "https://wuxiaworld.com",
    type: "light-novel",
    supportsSearch: true,
    supportsLatest: true,
    supportsGenres: true,
  },
  {
    id: "lightnovelworld",
    name: "Light Novel World",
    lang: "English",
    icon: "🌍",
    url: "https://lightnovelworld.com",
    type: "light-novel",
    supportsSearch: true,
    supportsLatest: true,
    supportsGenres: true,
  },
  {
    id: "novelbin",
    name: "NovelBin",
    lang: "English",
    icon: "📦",
    url: "https://novelbin.com",
    type: "web-novel",
    supportsSearch: true,
    supportsLatest: true,
    supportsGenres: true,
  },
  {
    id: "mtlnovel",
    name: "MTLNovel",
    lang: "Multi",
    icon: "🌐",
    url: "https://mtlnovel.com",
    type: "mixed",
    supportsSearch: true,
    supportsLatest: true,
    supportsGenres: true,
  },
  {
    id: "reaperscans",
    name: "ReaperScans",
    lang: "English",
    icon: "💀",
    url: "https://reaperscans.com",
    type: "light-novel",
    supportsSearch: true,
    supportsLatest: true,
    supportsGenres: false,
  },
];

// Genre categories for novel browsing
const genres = [
  "All", "Action", "Adventure", "Comedy", "Drama", "Fantasy",
  "Harem", "Historical", "Horror", "Isekai", "Josei",
  "Martial Arts", "Mature", "Mecha", "Mystery", "Psychological",
  "Romance", "School Life", "Sci-Fi", "Seinen", "Shoujo",
  "Shounen", "Slice of Life", "Sports", "Supernatural",
  "Tragedy", "Wuxia", "Xianxia", "Xuanhuan",
];

export async function GET() {
  return NextResponse.json({ sources, genres });
}
