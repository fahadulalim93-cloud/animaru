import type { Metadata } from "next";
import Link from "next/link";
const S = "https://luffytv.live";

export const metadata: Metadata = {
  title: "Watch Bengali Dubbed Anime Online Free in HD — LuffyTV",
  description: "Watch Bengali dubbed anime online for free in HD on LuffyTV. Stream anime episodes in Bengali dub. No signup, no ads, instant playback.",
  keywords: ["bengali dubbed anime","anime bengali dub","bengali dub anime online","watch bengali dubbed anime","anime in bengali","LuffyTV bengali"],
  alternates: { canonical: `${S}/bengali-dub` },
  openGraph: { title: "Watch Bengali Dubbed Anime Online Free in HD — LuffyTV", url: `${S}/bengali-dub`, siteName: "LuffyTV", type: "website" },
};

export default function BengaliDubPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <nav className="container mx-auto flex h-14 items-center justify-between px-4 border-b border-white/10">
        <Link href="/" className="font-bold text-lg"><span className="text-rose-500">LuffyTV</span></Link>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/tamil-dub" className="text-white/60 hover:text-white">Tamil</Link>
          <Link href="/hindi-dub" className="text-white/60 hover:text-white">Hindi</Link>
          <Link href="/bengali-dub" className="text-rose-500 font-semibold">Bengali Dub</Link>
        </div>
      </nav>
      <main className="container mx-auto px-4 py-12">
        <h1 className="text-4xl font-bold mb-4">Watch Bengali Dubbed Anime Online Free</h1>
        <p className="text-lg text-white/70 max-w-3xl mb-6">Stream anime episodes dubbed in Bengali on LuffyTV. Watch popular series in Bengali dub — HD quality, no signup, no ads.</p>
        <div className="flex gap-3 mb-10">
          <Link href="/#home" className="px-6 py-3 bg-rose-500 hover:bg-rose-600 rounded-lg font-semibold text-white">Browse Bengali Dub Anime →</Link>
        </div>
        <section className="max-w-3xl">
          <h2 className="text-2xl font-bold mb-4">Bengali Dubbed Anime on LuffyTV</h2>
          <div className="space-y-4 text-white/70 leading-relaxed">
            <p>Looking for anime in Bengali? LuffyTV offers anime episodes dubbed in Bengali, available to stream for free in HD quality. Our Bengali dub library is growing daily with popular series. No signup, no ads, instant playback on any device. LuffyTV supports Tamil, Hindi, Telugu, and Bengali dubs. Start watching at luffytv.live.</p>
          </div>
        </section>
      </main>
      <footer className="border-t border-white/10 py-6 text-center text-xs text-white/40">© {new Date().getFullYear()} LuffyTV — luffytv.live</footer>
    </div>
  );
}
