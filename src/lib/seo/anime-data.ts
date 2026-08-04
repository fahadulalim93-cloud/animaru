/**
 * Anime data for demo/SSG purposes
 * In production, this would come from an API/database
 */

export interface Anime {
  id: string;
  slug: string;
  title: string;
  titleJp?: string;
  description: string;
  image: string;
  banner?: string;
  rating: number;
  ratingCount: number;
  genre: string[];
  episodes: number;
  currentEpisode: number;
  status: "Airing" | "Completed" | "Upcoming";
  subDub: "sub" | "dub" | "both";
  year: number;
  season: "Winter" | "Spring" | "Summer" | "Fall";
  studio?: string;
  startDate?: string;
  endDate?: string;
  nextEpisode?: string;
  scheduleDay?: string;
}

export const TRENDING_ANIME: Anime[] = [
  {
    id: "1",
    slug: "one-piece",
    title: "One Piece",
    titleJp: "ワンピース",
    description:
      "Monkey D. Luffy sets off on an adventure with his pirate crew in hopes of finding the greatest treasure ever, known as 'One Piece.'",
    image: "https://cdn.example.com/anime/one-piece.jpg",
    banner: "https://cdn.example.com/anime/one-piece-banner.jpg",
    rating: 9.1,
    ratingCount: 42000,
    genre: ["Action", "Adventure", "Comedy", "Fantasy"],
    episodes: 1100,
    currentEpisode: 1100,
    status: "Airing",
    subDub: "both",
    year: 1999,
    season: "Fall",
    studio: "Toei Animation",
    scheduleDay: "Sunday",
  },
  {
    id: "2",
    slug: "solo-leveling",
    title: "Solo Leveling",
    titleJp: "俺だけレベルアップな件",
    description:
      "In a world where hunters must battle deadly monsters to protect humanity, Sung Jinwoo, the weakest hunter, gains a mysterious power that allows him to level up without limit.",
    image: "https://cdn.example.com/anime/solo-leveling.jpg",
    rating: 8.7,
    ratingCount: 28000,
    genre: ["Action", "Adventure", "Fantasy"],
    episodes: 12,
    currentEpisode: 12,
    status: "Completed",
    subDub: "both",
    year: 2024,
    season: "Winter",
    studio: "A-1 Pictures",
  },
  {
    id: "3",
    slug: "jujutsu-kaisen",
    title: "Jujutsu Kaisen",
    titleJp: "呪術廻戦",
    description:
      "A boy swallows a cursed talisman and becomes host to a powerful curse. He enrolls in a school of sorcerers to locate and consume the remaining fingers of the curse.",
    image: "https://cdn.example.com/anime/jujutsu-kaisen.jpg",
    rating: 8.6,
    ratingCount: 35000,
    genre: ["Action", "Fantasy", "Supernatural"],
    episodes: 48,
    currentEpisode: 48,
    status: "Completed",
    subDub: "both",
    year: 2020,
    season: "Fall",
    studio: "MAPPA",
  },
  {
    id: "4",
    slug: "demon-slayer",
    title: "Demon Slayer",
    titleJp: "鬼滅の刃",
    description:
      "A young boy becomes a demon slayer after his family is slaughtered and his sister is turned into a demon. He seeks a cure for his sister while fighting demons.",
    image: "https://cdn.example.com/anime/demon-slayer.jpg",
    rating: 8.9,
    ratingCount: 38000,
    genre: ["Action", "Fantasy", "Supernatural"],
    episodes: 55,
    currentEpisode: 55,
    status: "Completed",
    subDub: "both",
    year: 2019,
    season: "Spring",
    studio: "ufotable",
  },
  {
    id: "5",
    slug: "dragon-ball-daima",
    title: "Dragon Ball Daima",
    titleJp: "ドラゴンボールDAIMA",
    description:
      "Goku and friends are turned into children by a mysterious conspiracy. They must travel to the Demon Realm to uncover the truth and restore their bodies.",
    image: "https://cdn.example.com/anime/dragon-ball-daima.jpg",
    rating: 7.8,
    ratingCount: 12000,
    genre: ["Action", "Adventure", "Comedy", "Fantasy"],
    episodes: 20,
    currentEpisode: 20,
    status: "Completed",
    subDub: "both",
    year: 2024,
    season: "Fall",
    studio: "Toei Animation",
  },
  {
    id: "6",
    slug: "my-hero-academia",
    title: "My Hero Academia",
    titleJp: "僕のヒーローアカデミア",
    description:
      "In a world where most people have superpowers called Quirks, a Quirkless boy dreams of becoming the greatest hero. He inherits a powerful Quirk from the legendary All Might.",
    image: "https://cdn.example.com/anime/my-hero-academia.jpg",
    rating: 8.4,
    ratingCount: 30000,
    genre: ["Action", "Comedy", "Superpower"],
    episodes: 138,
    currentEpisode: 138,
    status: "Completed",
    subDub: "both",
    year: 2016,
    season: "Spring",
    studio: "Bones",
  },
  {
    id: "7",
    slug: "attack-on-titan",
    title: "Attack on Titan",
    titleJp: "進撃の巨人",
    description:
      "Humanity lives behind massive walls to protect themselves from giant humanoid Titans. When the walls are breached, Eren Yeager vows to exterminate every Titan.",
    image: "https://cdn.example.com/anime/attack-on-titan.jpg",
    rating: 9.0,
    ratingCount: 45000,
    genre: ["Action", "Drama", "Fantasy", "Military"],
    episodes: 87,
    currentEpisode: 87,
    status: "Completed",
    subDub: "both",
    year: 2013,
    season: "Spring",
    studio: "MAPPA",
  },
  {
    id: "8",
    slug: "spy-x-family",
    title: "Spy x Family",
    titleJp: "SPY×FAMILY",
    description:
      "A spy must build a fake family to execute a mission, not realizing that the girl he adopts is a telepath and his wife is an assassin.",
    image: "https://cdn.example.com/anime/spy-x-family.jpg",
    rating: 8.6,
    ratingCount: 25000,
    genre: ["Action", "Comedy", "Slice of Life"],
    episodes: 37,
    currentEpisode: 37,
    status: "Completed",
    subDub: "both",
    year: 2022,
    season: "Spring",
    studio: "WIT Studio",
  },
  {
    id: "9",
    slug: "chain-saw-man",
    title: "Chainsaw Man",
    titleJp: "チェンソーマン",
    description:
      "Denji is a young man who merges with his pet devil Pochita to become Chainsaw Man. He joins the Public Safety Devil Hunters to fight powerful devils threatening humanity.",
    image: "https://cdn.example.com/anime/chainsaw-man.jpg",
    rating: 8.5,
    ratingCount: 22000,
    genre: ["Action", "Fantasy", "Horror"],
    episodes: 12,
    currentEpisode: 12,
    status: "Completed",
    subDub: "both",
    year: 2022,
    season: "Fall",
    studio: "MAPPA",
  },
  {
    id: "10",
    slug: "bocchi-the-rock",
    title: "Bocchi the Rock!",
    titleJp: "ぼっち・ざ・ろっく！",
    description:
      "A socially anxious girl who plays guitar alone at home gets recruited by a band. She must overcome her crippling shyness to perform on stage.",
    image: "https://cdn.example.com/anime/bocchi-the-rock.jpg",
    rating: 8.8,
    ratingCount: 15000,
    genre: ["Comedy", "Music", "Slice of Life"],
    episodes: 12,
    currentEpisode: 12,
    status: "Completed",
    subDub: "sub",
    year: 2022,
    season: "Fall",
    studio: "CloverWorks",
  },
  {
    id: "11",
    slug: "frieren",
    title: "Frieren: Beyond Journey's End",
    titleJp: "葬送のフリーレン",
    description:
      "After the hero party defeats the Demon King, the elven mage Frieren embarks on a new journey to understand human emotions and the meaning of the connections she made.",
    image: "https://cdn.example.com/anime/frieren.jpg",
    rating: 9.3,
    ratingCount: 32000,
    genre: ["Adventure", "Drama", "Fantasy"],
    episodes: 28,
    currentEpisode: 28,
    status: "Completed",
    subDub: "both",
    year: 2023,
    season: "Fall",
    studio: "Madhouse",
  },
  {
    id: "12",
    slug: "shangri-la-frontier",
    title: "Shangri-La Frontier",
    titleJp: "シャングリラ・フロンティア",
    description:
      "A trash game enthusiast dives into the legendary VR game Shangri-La Frontier, determined to conquer its most challenging content with his skills from playing terrible games.",
    image: "https://cdn.example.com/anime/shangri-la-frontier.jpg",
    rating: 7.9,
    ratingCount: 8000,
    genre: ["Action", "Adventure", "Fantasy", "Gaming"],
    episodes: 25,
    currentEpisode: 25,
    status: "Airing",
    subDub: "sub",
    year: 2023,
    season: "Fall",
    studio: "C2C",
    scheduleDay: "Sunday",
  },
];

/**
 * Get all anime slugs for static generation
 */
export function getAllAnimeSlugs(): string[] {
  return TRENDING_ANIME.map((anime) => anime.slug);
}

/**
 * Get anime by slug
 */
export function getAnimeBySlug(slug: string): Anime | undefined {
  return TRENDING_ANIME.find((anime) => anime.slug === slug);
}

/**
 * Schedule grouped by day
 */
export const WEEKLY_SCHEDULE: Record<string, Anime[]> = {
  Sunday: TRENDING_ANIME.filter((a) => a.scheduleDay === "Sunday" || a.status === "Airing").slice(0, 3),
  Monday: TRENDING_ANIME.filter((a) => a.genre.includes("Action")).slice(0, 3),
  Tuesday: TRENDING_ANIME.filter((a) => a.genre.includes("Comedy")).slice(0, 3),
  Wednesday: TRENDING_ANIME.filter((a) => a.genre.includes("Fantasy")).slice(0, 3),
  Thursday: TRENDING_ANIME.filter((a) => a.genre.includes("Adventure")).slice(0, 3),
  Friday: TRENDING_ANIME.filter((a) => a.genre.includes("Drama")).slice(0, 3),
  Saturday: TRENDING_ANIME.filter((a) => a.genre.includes("Supernatural")).slice(0, 3),
};
