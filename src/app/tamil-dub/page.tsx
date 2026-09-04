import type { Metadata } from "next";
import Link from "next/link";

const SITE_URL = "https://luffytv.live";

export const metadata: Metadata = {
  title: "Watch Tamil Dubbed Anime Online Free in HD — LuffyTV",
  description:
    "Watch Tamil dubbed anime online for free in HD on LuffyTV. Stream 1,000+ anime episodes in Tamil dub including Jujutsu Kaisen, Demon Slayer, One Piece, Solo Leveling, Attack on Titan and more. No signup, no ads, instant playback.",
  keywords: [
    "anime in tamil", "tamil dubbed anime", "anime tamil dub", "tamil dub anime",
    "anime in tamil dubbed", "watch tamil dubbed anime", "tamil dubbed anime online",
    "anime tamil dub free", "tamil anime watch online", "tamil anime streaming",
    "one piece tamil dub", "naruto tamil dub", "demon slayer tamil dub",
    "attack on titan tamil dub", "jujutsu kaisen tamil dub", "dragon ball tamil dub",
    "LuffyTV tamil", "luffytv.live tamil",
  ],
  alternates: { canonical: `${SITE_URL}/tamil-dub` },
  openGraph: {
    title: "Watch Tamil Dubbed Anime Online Free in HD — LuffyTV",
    description: "Watch Tamil dubbed anime online for free in HD on LuffyTV. Stream 1,000+ anime episodes in Tamil dub.",
    url: `${SITE_URL}/tamil-dub`,
    siteName: "LuffyTV",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Watch Tamil Dubbed Anime Online Free in HD — LuffyTV",
    description: "Watch Tamil dubbed anime online for free in HD on LuffyTV. 1,000+ episodes in Tamil dub.",
  },
};

const FAQ_DATA = [
  { q: "Where can I watch anime in Tamil dub for free?", a: "You can watch Tamil dubbed anime for free on LuffyTV (luffytv.live). LuffyTV offers 1,000+ anime episodes dubbed in Tamil with HD quality, no signup, and no ads." },
  { q: "Which anime are available in Tamil dub on LuffyTV?", a: "LuffyTV has Tamil dubs for popular anime including Jujutsu Kaisen, Demon Slayer (Kimetsu no Yaiba), One Piece, Solo Leveling, Attack on Titan, Dragon Ball Super, Naruto Shippuden, Chainsaw Man, My Hero Academia, and many more." },
  { q: "Is LuffyTV free for watching Tamil dubbed anime?", a: "Yes, LuffyTV is completely free. No signup, no ads, and no payment required. Just visit luffytv.live and start watching Tamil dubbed anime instantly." },
  { q: "How do I switch between Tamil dub and English sub?", a: "On any episode page, use the audio/subtitle toggle to switch between Tamil dub and English sub. LuffyTV supports multiple audio tracks and subtitle languages." },
  { q: "Are new Tamil dub episodes added regularly?", a: "Yes, LuffyTV adds new Tamil dubbed episodes daily. Check the schedule page to see when new episodes are airing, or visit the Tamil dub page for the latest additions." },
];

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_DATA.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export default function TamilDubPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_SCHEMA) }} />
      <div className="min-h-screen bg-black text-white">
        <nav className="container mx-auto flex h-14 items-center justify-between px-4 border-b border-white/10">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg">
            <span className="text-rose-500">LuffyTV</span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/trending" className="text-white/60 hover:text-white">Trending</Link>
            <Link href="/tamil-dub" className="text-rose-500 font-semibold">Tamil Dub</Link>
            <Link href="/hindi-dub" className="text-white/60 hover:text-white">Hindi</Link>
            <Link href="/schedule" className="text-white/60 hover:text-white">Schedule</Link>
            <Link href="/library" className="text-white/60 hover:text-white">Library</Link>
          </div>
        </nav>

        <main className="container mx-auto px-4 py-12">
          <h1 className="text-4xl font-bold mb-4">Watch Tamil Dubbed Anime Online Free</h1>
          <p className="text-lg text-white/70 max-w-3xl mb-6">
            Stream 1,000+ anime episodes dubbed in Tamil on LuffyTV. Watch popular series like Jujutsu Kaisen, Demon Slayer, One Piece, Solo Leveling, Attack on Titan and more — all in Tamil dub, HD quality, no signup, no ads.
          </p>

          <div className="flex gap-3 mb-10">
            <Link href="/#home" className="px-6 py-3 bg-rose-500 hover:bg-rose-600 rounded-lg font-semibold text-white">Browse Tamil Dub Anime →</Link>
            <Link href="/trending" className="px-6 py-3 border border-white/20 hover:border-white/40 rounded-lg font-semibold text-white">View Trending</Link>
          </div>

          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-4">Trending Tamil Dubbed Anime</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {["Jujutsu Kaisen", "Demon Slayer", "One Piece", "Solo Leveling", "Attack on Titan", "Dragon Ball Super", "Naruto Shippuden", "Chainsaw Man", "My Hero Academia", "Spy x Family", "Death Note", "Bleach"].map((name) => (
                <Link key={name} href={`/#search/${encodeURIComponent(name)}`} className="group">
                  <div className="aspect-[3/4] rounded-lg bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors">
                    <span className="text-3xl font-bold text-white/10 group-hover:text-rose-500/30 transition-colors">{name.charAt(0)}</span>
                  </div>
                  <h3 className="mt-2 text-sm font-medium group-hover:text-rose-500 transition-colors">{name}</h3>
                  <p className="text-xs text-white/40">Tamil Dub • HD</p>
                </Link>
              ))}
            </div>
          </section>

          <section className="max-w-3xl mb-12">
            <h2 className="text-2xl font-bold mb-4">About Tamil Dubbed Anime on LuffyTV</h2>
            <div className="space-y-4 text-white/70 leading-relaxed">
              <p>Looking for anime in Tamil? LuffyTV is your go-to destination for Tamil dubbed anime online. We offer a massive collection of over 1,000 anime episodes dubbed in Tamil, available to stream for free in HD quality. From action-packed series like Jujutsu Kaisen and Demon Slayer to long-running favorites like One Piece and Naruto, our Tamil dub library has something for every anime fan in Tamil Nadu and beyond.</p>
              <p>Watching Tamil dubbed anime on LuffyTV is completely free — no signup required, no ads interrupting your episodes, and instant playback on any device. Whether you are on mobile, tablet, or desktop, our player is optimized for smooth streaming. We add new Tamil dub episodes daily, so you can always find the latest releases right here.</p>
              <p>LuffyTV supports multiple Indian language dubs including Tamil, Hindi, Telugu, and Bengali — so you can watch anime in your preferred language. Switch between Tamil dub and English sub on any episode with a single click. Start watching your favorite anime in Tamil right now at luffytv.live.</p>
            </div>
          </section>

          <section className="max-w-3xl mb-12">
            <h2 className="text-2xl font-bold mb-6">Frequently Asked Questions — Tamil Dubbed Anime</h2>
            <div className="space-y-6">
              {FAQ_DATA.map((f, i) => (
                <div key={i}>
                  <h3 className="font-semibold text-lg mb-2">{f.q}</h3>
                  <p className="text-white/70">{f.a}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="max-w-3xl border-t border-white/10 pt-8">
            <h2 className="text-2xl font-bold mb-4">தமிழில் அனிமே பார்க்க — Anime in Tamil</h2>
            <div className="space-y-4 text-white/70 leading-relaxed">
              <p>தமிழ் டப்பில் அனிமே பார்க்க விரும்புகிறீர்களா? LuffyTV-ல் 1,000-க்கும் மேற்பட்ட அனிமே எபிசோடுகளை தமிழ் டப்பில் இலவசமாக HD தரத்தில் ஸ்ட்ரீம் செய்யலாம். ஜுஜுத்சு கைசென், டெமன் ஸ்லேயர், ஒன் பீஸ், சோலோ லெவலிங் போன்ற பிரபலமான அனிமேக்கள் அனைத்தும் தமிழில் கிடைக்கின்றன. பதிவு செய்ய வேண்டாம், விளம்பரங்கள் இல்லை, உடனடியாக பார்க்கலாம்.</p>
              <p>LuffyTV என்பது இந்தியாவின் #1 இலவச அனிமே ஸ்ட்ரீமிங் தளம். தமிழ், ஹிந்தி, தெலுங்கு, வங்காளம் மற்றும் ஆங்கிலம் உட்பட பல மொழிகளில் அனிமே பார்க்கலாம். தினமும் புதிய தமிழ் டப் எபிசோடுகள் சேர்க்கப்படுகின்றன. luffytv.live பக்கத்திற்கு செல்லுங்கள்.</p>
            </div>
          </section>
        </main>

        <footer className="border-t border-white/10 py-6 text-center text-xs text-white/40">
          © {new Date().getFullYear()} LuffyTV — luffytv.live
        </footer>
      </div>
    </>
  );
}
