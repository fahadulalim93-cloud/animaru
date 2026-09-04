import type { Metadata } from "next";
import Link from "next/link";
const S = "https://luffytv.live";

export const metadata: Metadata = {
  title: "Watch Hindi Dubbed Anime Online Free in HD — LuffyTV",
  description: "Watch Hindi dubbed anime online for free in HD on LuffyTV. Stream 1,500+ anime episodes in Hindi dub including Jujutsu Kaisen, Demon Slayer, One Piece, Dragon Ball and more. No signup, no ads.",
  keywords: ["hindi dubbed anime","anime hindi dub","hindi dub anime online","watch hindi dubbed anime","anime in hindi","hindi anime streaming","LuffyTV hindi","luffytv.live hindi"],
  alternates: { canonical: `${S}/hindi-dub` },
  openGraph: { title: "Watch Hindi Dubbed Anime Online Free in HD — LuffyTV", url: `${S}/hindi-dub`, siteName: "LuffyTV", type: "website" },
};

export default function HindiDubPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <nav className="container mx-auto flex h-14 items-center justify-between px-4 border-b border-white/10">
        <Link href="/" className="font-bold text-lg"><span className="text-rose-500">LuffyTV</span></Link>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/tamil-dub" className="text-white/60 hover:text-white">Tamil</Link>
          <Link href="/hindi-dub" className="text-rose-500 font-semibold">Hindi Dub</Link>
          <Link href="/telugu-dub" className="text-white/60 hover:text-white">Telugu</Link>
          <Link href="/trending" className="text-white/60 hover:text-white">Trending</Link>
        </div>
      </nav>
      <main className="container mx-auto px-4 py-12">
        <h1 className="text-4xl font-bold mb-4">Watch Hindi Dubbed Anime Online Free</h1>
        <p className="text-lg text-white/70 max-w-3xl mb-6">Stream 1,500+ anime episodes dubbed in Hindi on LuffyTV. Watch popular series like Jujutsu Kaisen, Demon Slayer, One Piece, Dragon Ball Super, Naruto, Attack on Titan and more — all in Hindi dub, HD quality, no signup, no ads.</p>
        <div className="flex gap-3 mb-10">
          <Link href="/#home" className="px-6 py-3 bg-rose-500 hover:bg-rose-600 rounded-lg font-semibold text-white">Browse Hindi Dub Anime →</Link>
        </div>
        <section className="max-w-3xl mb-12">
          <h2 className="text-2xl font-bold mb-4">Hindi Dubbed Anime on LuffyTV</h2>
          <div className="space-y-4 text-white/70 leading-relaxed">
            <p>Looking for anime in Hindi? LuffyTV is the best destination for Hindi dubbed anime online. We offer over 1,500 anime episodes dubbed in Hindi, available to stream for free in HD quality. From action hits like Jujutsu Kaisen and Demon Slayer to classics like Dragon Ball and Naruto, our Hindi dub library covers every genre. No signup, no ads, instant playback on any device.</p>
            <p>LuffyTV adds new Hindi dub episodes daily and supports multiple audio tracks including Hindi, Tamil, Telugu, Bengali and English subtitles. Switch between Hindi dub and English sub on any episode. Start watching at luffytv.live.</p>
          </div>
        </section>
        <section className="max-w-3xl border-t border-white/10 pt-8">
          <h2 className="text-2xl font-bold mb-4">हिंदी डब अनिमे — Anime in Hindi</h2>
          <div className="space-y-4 text-white/70 leading-relaxed">
            <p>हिंदी डब में अनिमे देखना चाहते हैं? LuffyTV पर 1,500 से अधिक अनिमे एपिसोड हिंदी डब में मुफ्त HD में स्ट्रीम करें। जुजुत्सु कैसन, डेमन स्लेयर, वन पीस, ड्रैगन बॉल जैसे लोकप्रिय अनिमे सभी हिंदी में उपलब्ध हैं। साइनअप नहीं, विज्ञापन नहीं, तुरंत देखें।</p>
          </div>
        </section>
      </main>
      <footer className="border-t border-white/10 py-6 text-center text-xs text-white/40">© {new Date().getFullYear()} LuffyTV — luffytv.live</footer>
    </div>
  );
}
