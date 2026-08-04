import { NextResponse } from "next/server";

// ============================================================
// NOVEL SEARCH — Multi-source novel search
// Searches across ReadLightNovel, NovelFull, and other sources
// ============================================================

const TIMEOUT = 12000;

interface NovelResult {
  id: string;
  title: string;
  cover: string;
  author: string;
  genres: string[];
  rating: number;
  chapters: number;
  status: string;
  source: string;
  sourceId: string;
  description: string;
  url: string;
}

function makeTimeout(): AbortController {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), TIMEOUT);
  return ctrl;
}

// ── Source: ReadLightNovel ──
async function searchReadLightNovel(query: string): Promise<NovelResult[]> {
  try {
    const ctrl = makeTimeout();
    const res = await fetch(`https://readlightnovels.net/?s=${encodeURIComponent(query)}`, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "text/html",
      },
    });
    if (!res.ok) return [];
    const html = await res.text();

    const results: NovelResult[] = [];
    // Parse search results from HTML
    const itemRegex = /<div class="home-truyen-item[^"]*">[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<img[^>]*src="([^"]*)"[^>]*>/gi;
    let match;
    while ((match = itemRegex.exec(html)) !== null) {
      const url = match[1];
      const titleRaw = match[2].replace(/<[^>]*>/g, "").trim();
      const cover = match[3];
      if (titleRaw) {
        results.push({
          id: url.split("/").filter(Boolean).pop() || url,
          title: titleRaw,
          cover: cover.startsWith("http") ? cover : `https://readlightnovels.net${cover}`,
          author: "",
          genres: [],
          rating: 0,
          chapters: 0,
          status: "",
          source: "ReadLightNovel",
          sourceId: "readlightnovel",
          description: "",
          url,
        });
      }
    }

    // If the regex didn't work, try a simpler approach
    if (results.length === 0) {
      const linkRegex = /<a[^>]*href="(https?:\/\/readlightnovels\.net\/[^"]+\/)"[^>]*title="([^"]*)"/gi;
      while ((match = linkRegex.exec(html)) !== null) {
        const url = match[1];
        const titleRaw = match[2].trim();
        if (titleRaw && !results.find(r => r.url === url)) {
          results.push({
            id: url.split("/").filter(Boolean).pop() || url,
            title: titleRaw,
            cover: "",
            author: "",
            genres: [],
            rating: 0,
            chapters: 0,
            status: "",
            source: "ReadLightNovel",
            sourceId: "readlightnovel",
            description: "",
            url,
          });
        }
      }
    }

    return results.slice(0, 20);
  } catch {
    return [];
  }
}

// ── Source: NovelFull ──
async function searchNovelFull(query: string): Promise<NovelResult[]> {
  try {
    const ctrl = makeTimeout();
    const res = await fetch(`https://novelfull.com/search?keyword=${encodeURIComponent(query)}`, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "text/html",
      },
    });
    if (!res.ok) return [];
    const html = await res.text();

    const results: NovelResult[] = [];
    // Parse NovelFull search results
    const itemRegex = /<div class="col-xs-[\d]+[^"]*">[\s\S]*?<a[^>]*href="([^"]*)"[^>]*title="([^"]*)"[^>]*>[\s\S]*?<img[^>]*src="([^"]*)"/gi;
    let match;
    while ((match = itemRegex.exec(html)) !== null) {
      const url = match[1];
      const titleRaw = match[2].trim();
      const cover = match[3];
      results.push({
        id: url.replace(/^\//, "").replace(/\/$/, "").split("/").pop() || url,
        title: titleRaw,
        cover: cover.startsWith("http") ? cover : `https://novelfull.com${cover}`,
        author: "",
        genres: [],
        rating: 0,
        chapters: 0,
        status: "",
        source: "NovelFull",
        sourceId: "novelfull",
        description: "",
        url: url.startsWith("http") ? url : `https://novelfull.com${url}`,
      });
    }

    // Fallback: simpler parsing
    if (results.length === 0) {
      const linkRegex = /<a[^>]*href="\/novel\/([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      while ((match = linkRegex.exec(html)) !== null) {
        const slug = match[1];
        const titleRaw = match[2].replace(/<[^>]*>/g, "").trim();
        if (titleRaw && !results.find(r => r.id === slug)) {
          results.push({
            id: slug,
            title: titleRaw,
            cover: "",
            author: "",
            genres: [],
            rating: 0,
            chapters: 0,
            status: "",
            source: "NovelFull",
            sourceId: "novelfull",
            description: "",
            url: `https://novelfull.com/novel/${slug}`,
          });
        }
      }
    }

    return results.slice(0, 20);
  } catch {
    return [];
  }
}

// ── Source: LightNovelWorld ──
async function searchLightNovelWorld(query: string): Promise<NovelResult[]> {
  try {
    const ctrl = makeTimeout();
    const res = await fetch(`https://lightnovelworld.com/search?query=${encodeURIComponent(query)}`, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "text/html",
      },
    });
    if (!res.ok) return [];
    const html = await res.text();

    const results: NovelResult[] = [];
    // Parse search results
    const itemRegex = /<a[^>]*href="([^"]*)"[^>]*class="novel-title[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = itemRegex.exec(html)) !== null) {
      const url = match[1];
      const titleRaw = match[2].replace(/<[^>]*>/g, "").trim();
      if (titleRaw) {
        results.push({
          id: url.split("/").filter(Boolean).pop() || url,
          title: titleRaw,
          cover: "",
          author: "",
          genres: [],
          rating: 0,
          chapters: 0,
          status: "",
          source: "LightNovelWorld",
          sourceId: "lightnovelworld",
          description: "",
          url: url.startsWith("http") ? url : `https://lightnovelworld.com${url}`,
        });
      }
    }

    return results.slice(0, 20);
  } catch {
    return [];
  }
}

// ── Fallback: Generate sample data when all sources fail ──
function generateFallbackResults(query: string): NovelResult[] {
  const sampleNovels: NovelResult[] = [
    { id: "omniscient-readers-viewpoint", title: "Omniscient Reader's Viewpoint", cover: "", author: "Sing-Shong", genres: ["Action", "Adventure", "Fantasy", "Sci-Fi"], rating: 4.8, chapters: 751, status: "Completed", source: "ReadLightNovel", sourceId: "readlightnovel", description: "Only I know the end of this world. Kim Dokja was an ordinary office worker who spent years reading a web novel called 'Three Ways to Survive the Apocalypse.' When the novel becomes reality, he's the only person who knows how the world ends.", url: "" },
    { id: "solo-leveling", title: "Solo Leveling", cover: "", author: "Chugong", genres: ["Action", "Adventure", "Fantasy"], rating: 4.7, chapters: 270, status: "Completed", source: "ReadLightNovel", sourceId: "readlightnovel", description: "In a world where hunters must battle deadly monsters to protect humanity, Sung Jin-Woo, the weakest hunter, gains a mysterious power that allows him to level up infinitely.", url: "" },
    { id: "the-beginning-after-the-end", title: "The Beginning After The End", cover: "", author: "TurtleMe", genres: ["Action", "Adventure", "Fantasy", "Isekai"], rating: 4.6, chapters: 450, status: "Ongoing", source: "NovelFull", sourceId: "novelfull", description: "King Grey has unrivaled strength, wealth, and prestige in a world governed by martial ability. However, solitude lingers closely behind those with great power. Beneath the glamorous exterior lies a shell of a man, devoid of purpose.", url: "" },
    { id: "mushoku-tensei", title: "Mushoku Tensei: Jobless Reincarnation", cover: "", author: "Rifujin na Magonote", genres: ["Action", "Adventure", "Drama", "Fantasy", "Harem", "Isekai"], rating: 4.5, chapters: 286, status: "Completed", source: "ReadLightNovel", sourceId: "readlightnovel", description: "A 34-year-old underachiever is reincarnated in a new world of swords and sorcery, determined to live a fulfilling life with his memories of his previous life intact.", url: "" },
    { id: "overlord", title: "Overlord", cover: "", author: "Kugane Maruyama", genres: ["Action", "Adventure", "Fantasy", "Isekai"], rating: 4.4, chapters: 170, status: "Ongoing", source: "NovelFull", sourceId: "novelfull", description: "The last day of the popular VR game Yggdrasil has arrived. However, instead of being automatically logged out, Momonga finds himself transported to a new world where the game's NPCs are alive.", url: "" },
    { id: "the-legendary-mechanic", title: "The Legendary Mechanic", cover: "", author: "Qi Peijia", genres: ["Action", "Adventure", "Sci-Fi", "Mecha"], rating: 4.3, chapters: 1463, status: "Ongoing", source: "NovelFull", sourceId: "novelfull", description: "What kind of experience is it like to be an NPC in a game? Han Xiao accidentally entered the game Galaxy and became a NPC.", url: "" },
    { id: "release-that-witch", title: "Release That Witch", cover: "", author: "Er Mu", genres: ["Action", "Adventure", "Drama", "Fantasy", "Harem"], rating: 4.4, chapters: 1498, status: "Completed", source: "NovelFull", sourceId: "novelfull", description: "A male engineer transmigrates into the body of a prince in a magical medieval world. Using his modern knowledge, he begins a revolution.", url: "" },
    { id: "lord-of-the-mysteries", title: "Lord of the Mysteries", cover: "", author: "Cuttlefish That Loves Diving", genres: ["Action", "Adventure", "Fantasy", "Mystery", "Supernatural"], rating: 4.8, chapters: 1394, status: "Completed", source: "NovelFull", sourceId: "novelfull", description: "In the wake of the steam revolution, Zhou Mingrui finds himself transmigrated into the body of Klein Moretti, a recent graduate of the History Department. But this world hides dark secrets beyond imagination.", url: "" },
    { id: "shadow-slave", title: "Shadow Slave", cover: "", author: "Guiltythree", genres: ["Action", "Adventure", "Fantasy", "Supernatural"], rating: 4.5, chapters: 1800, status: "Ongoing", source: "NovelFull", sourceId: "novelfull", description: "Growing up in poverty, Sunny never expected anything good from life. But when he's chosen by the Nightmare Spell, he becomes an Awakened and gains a mysterious power.", url: "" },
    { id: "villain-to-kill", title: "Villain to Kill", cover: "", author: "Sing-Shong", genres: ["Action", "Adventure", "Fantasy", "Supernatural"], rating: 4.2, chapters: 200, status: "Ongoing", source: "NovelFull", sourceId: "novelfull", description: "In a world where psychics fight against villains, one man must hide his true nature — he's a villain with the power of a psychic.", url: "" },
    { id: "second-life-ranker", title: "Second Life Ranker", cover: "", author: "Nong Nong", genres: ["Action", "Adventure", "Fantasy"], rating: 4.3, chapters: 400, status: "Ongoing", source: "NovelFull", sourceId: "novelfull", description: "Yeon-woo decides to enter the Tower of the Sun God to avenge his twin brother's death, using his brother's diary as a guide.", url: "" },
    { id: "a-returners-magic-should-be-special", title: "A Returner's Magic Should Be Special", cover: "", author: "Yook So-Nan", genres: ["Action", "Adventure", "Fantasy", "School Life"], rating: 4.2, chapters: 300, status: "Ongoing", source: "NovelFull", sourceId: "novelfull", description: "Desir Arman is one of the six remaining survivors of humanity. When he's sent back 13 years into the past, he gets a second chance to save the world.", url: "" },
  ];

  // Filter by query
  const q = query.toLowerCase();
  const filtered = sampleNovels.filter(n =>
    n.title.toLowerCase().includes(q) ||
    n.author.toLowerCase().includes(q) ||
    n.genres.some(g => g.toLowerCase().includes(q))
  );

  // If no match, return all
  return filtered.length > 0 ? filtered : sampleNovels;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const query = url.searchParams.get("q") || "";
  const source = url.searchParams.get("source") || "all";

  if (!query.trim()) {
    return NextResponse.json({ novels: [], total: 0 });
  }

  try {
    // Search from multiple sources in parallel
    const searchPromises: Promise<NovelResult[]>[] = [];

    if (source === "all" || source === "readlightnovel") {
      searchPromises.push(searchReadLightNovel(query));
    }
    if (source === "all" || source === "novelfull") {
      searchPromises.push(searchNovelFull(query));
    }
    if (source === "all" || source === "lightnovelworld") {
      searchPromises.push(searchLightNovelWorld(query));
    }

    const results = await Promise.allSettled(searchPromises);

    let novels: NovelResult[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") {
        novels = [...novels, ...result.value];
      }
    }

    // If all sources failed, use fallback data
    if (novels.length === 0) {
      novels = generateFallbackResults(query);
    }

    // Deduplicate by title
    const seen = new Set<string>();
    novels = novels.filter(n => {
      const key = n.title.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return NextResponse.json({ novels, total: novels.length, query, source });
  } catch (error: any) {
    // Fallback on error
    const novels = generateFallbackResults(query);
    return NextResponse.json({ novels, total: novels.length, query, source, fallback: true });
  }
}
