import type { Metadata } from "next";
import Link from "next/link";
const S = "https://luffytv.live";

export const metadata: Metadata = {
  title: "Watch Telugu Dubbed Anime Online Free in HD — LuffyTV",
  description: "Watch Telugu dubbed anime online for free in HD on LuffyTV. Stream anime episodes in Telugu dub including popular series. No signup, no ads, instant playback.",
  keywords: ["telugu dubbed anime","anime telugu dub","telugu dub anime online","watch telugu dubbed anime","anime in telugu","LuffyTV telugu"],
  alternates: { canonical: `${S}/telugu-dub` },
  openGraph: { title: "Watch Telugu Dubbed Anime Online Free in HD — LuffyTV", url: `${S}/telugu-dub`, siteName: "LuffyTV", type: "website" },
};

export default function TeluguDubPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <nav className="container mx-auto flex h-14 items-center justify-between px-4 border-b border-white/10">
        <Link href="/" className="font-bold text-lg"><span className="text-rose-500">LuffyTV</span></Link>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/tamil-dub" className="text-white/60 hover:text-white">Tamil</Link>
          <Link href="/hindi-dub" className="text-white/60 hover:text-white">Hindi</Link>
          <Link href="/telugu-dub" className="text-rose-500 font-semibold">Telugu Dub</Link>
        </div>
      </nav>
      <main className="container mx-auto px-4 py-12">
        <h1 className="text-4xl font-bold mb-4">Watch Telugu Dubbed Anime Online Free</h1>
        <p className="text-lg text-white/70 max-w-3xl mb-6">Stream anime episodes dubbed in Telugu on LuffyTV. Watch popular series in Telugu dub — HD quality, no signup, no ads. LuffyTV is the #1 free anime streaming site for Indian language dubs.</p>
        <div className="flex gap-3 mb-10">
          <Link href="/#home" className="px-6 py-3 bg-rose-500 hover:bg-rose-600 rounded-lg font-semibold text-white">Browse Telugu Dub Anime →</Link>
        </div>
        <section className="max-w-3xl">
          <h2 className="text-2xl font-bold mb-4">Telugu Dubbed Anime on LuffyTV</h2>
          <div className="space-y-4 text-white/70 leading-relaxed">
            <p>Looking for anime in Telugu? LuffyTV offers a growing collection of anime episodes dubbed in Telugu, available to stream for free in HD quality. From action series like Jujutsu Kaisen and Demon Slayer to classics like Dragon Ball and Naruto, our Telugu dub library has something for every anime fan in Andhra Pradesh and Telangana. No signup, no ads, instant playback on any device.</p>
            <p>LuffyTV supports multiple Indian language dubs — Tamil, Hindi, Telugu, and Bengali. Switch between Telugu dub and English sub on any episode. Start watching at luffytv.live.</p>
          </div>
        </section>
      </main>
      <footer className="border-t border-white/10 py-6 text-center text-xs text-white/40">© {new Date().getFullYear()} LuffyTV — luffytv.live</footer>
    </div>
  );
}
