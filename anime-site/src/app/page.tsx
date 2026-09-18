import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import HeroBanner from "@/components/HeroBanner";
import AnimeRow from "@/components/AnimeRow";
import { getTrending, getRecent, getPopular } from "@/lib/anilist";

export const metadata: Metadata = {
  title: "AnimeVault — Watch Anime Free in HD",
  description: "Stream anime online in HD with English sub & dub. Browse trending, popular, and recently added anime.",
};

export default async function Home() {
  // Fetch data from AniList (for banners + card info)
  const [trending, recent, popular] = await Promise.all([
    getTrending(5),
    getRecent(20),
    getPopular(20),
  ]);

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Sidebar />
      {/* Main content offset by sidebar width */}
      <main className="ml-[72px]">
        {/* Hero Banner */}
        <HeroBanner anime={trending} />

        {/* Content rows */}
        <div className="pt-8 pb-20">
          <AnimeRow title="Recently Added" anime={recent} />
          <AnimeRow title="Popular Now" anime={popular} />
          <AnimeRow title="Trending" anime={trending} />
        </div>
      </main>
    </div>
  );
}
