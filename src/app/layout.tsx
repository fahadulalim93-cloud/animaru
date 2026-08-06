import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Mono, Inter, Space_Grotesk, Outfit, Karla } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

// Karla — Shiroko's hero font (used for title, badges, genre tags)
const karla = Karla({
  variable: "--font-karla",
  subsets: ["latin"],
  weight: ["200", "300", "400", "500", "600", "700", "800"],
});

const SITE_URL = "https://luffytv.live";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "LuffyTV — Watch Anime Online Free in HD — Tamil, Hindi, Telugu, Bengali Dub & English Sub",
    template: "%s | LuffyTV",
  },
  description:
    "Watch anime online free in HD on LuffyTV. Stream 10,000+ anime episodes with Tamil dub, Hindi dub, Telugu dub, Bengali dub & English sub. No signup, no ads, instant playback. LuffyTV is the #1 free anime streaming site for dubbed & subbed anime in India.",
  applicationName: "LuffyTV",
  keywords: [
    // Primary brand — CRITICAL for branded search ("luffyTV", "luffy", "luffytv")
    "LuffyTV", "luffytv", "Luffy TV", "luffy tv", "luffy",
    "luffytv.live", "luffy tv anime", "luffy anime", "luffy tv streaming",
    // Watch anime
    "watch anime online free", "free anime streaming", "anime online free",
    "watch anime free", "anime streaming free", "free anime",
    // Tamil dub — HIGHEST PRIORITY for "anime in tamil"
    "anime in tamil", "tamil dubbed anime", "anime tamil dub",
    "tamil dub anime", "watch tamil dubbed anime", "tamil dubbed anime online",
    "anime tamil dub free", "tamil anime watch online", "tamil anime streaming",
    "one piece tamil dub", "naruto tamil dub", "demon slayer tamil dub",
    "attack on titan tamil dub", "jujutsu kaisen tamil dub",
    "\u0C85\u0CA8\u0CBF\u0CAE\u0BC7 \u0BA4\u0BAE\u0BBF\u0BB4\u0BCD", "\u0BA4\u0BAE\u0BBF\u0BB4\u0BCD \u0B9F\u0AAA\u0BCD \u0C85\u0CA8\u0CBF\u0CAE\u0BC7",
    // Hindi dub
    "hindi dubbed anime", "anime hindi dub", "hindi dub anime online",
    "watch anime in hindi", "hindi anime",
    // Telugu & Bengali dub
    "telugu dubbed anime", "anime telugu dub", "bengali dubbed anime", "anime bengali dub",
    // General
    "trending anime", "latest anime episodes", "popular anime series",
    "anime schedule", "subbed anime", "dubbed anime", "HD anime",
    "anime movies", "manga online", "anime without ads", "anime no signup",
    "movies", "TV shows", "manga", "light novels", "streaming",
  ],
  authors: [{ name: "Luffy TV" }],
  creator: "Luffy TV",
  publisher: "Luffy TV",
  alternates: {
    // canonical is set PER-PAGE via generateMetadata, not globally.
    // Setting it here to SITE_URL makes ALL pages appear as duplicates of /.
    // Only the homepage (/) should have canonical = SITE_URL.
    languages: {
      "x-default": SITE_URL,
      "en": SITE_URL,
    },
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  openGraph: {
    type: "website",
    siteName: "LuffyTV",
    title: "LuffyTV — Watch Anime Online Free in HD — Tamil, Hindi, Telugu, Bengali Dub & English Sub",
    description:
      "Watch anime online free in HD on LuffyTV. Stream 10,000+ anime with Tamil dub, Hindi dub, Telugu dub, Bengali dub & English sub. No signup, no ads. #1 free anime site in India.",
    url: SITE_URL,
    locale: "en_US",
    alternateLocale: ["ta", "hi", "te", "bn"],
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "LuffyTV — Watch Anime Free in HD with Tamil & Hindi Dub" }],
  },
  twitter: {
    card: "summary_large_image",
    site: "@luffytv",
    title: "LuffyTV — Watch Anime Free in HD — Tamil, Hindi Dub & English Sub",
    description: "Stream 10,000+ anime free in HD. Tamil dub, Hindi dub, Telugu dub, Bengali dub & English sub. No signup, no ads.",
    images: ["/og.png"],
  },
  category: "entertainment",
  other: {
    "google-site-verification": process.env.GOOGLE_SITE_VERIFICATION || "",
    "msvalidate.01": process.env.BING_VALIDATION_CODE || "",
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
    shortcut: "/favicon.ico",
  },
};

// Structured data — Organization + WebSite with a sitelinks SearchAction.
// The SearchAction is what makes Google render a search box under the site's
// result ("sitelinks search box"), a strong signal for branded queries.
//
// FIX: "Review has multiple aggregate ratings" error was caused by having both
// `offers` and `aggregateRating` on SoftwareApplication. Google's rich results
// parser treats the combination as a Review with its own aggregateRating,
// creating a duplicate. Fix: separate into SoftwareApplication (with offers only)
// and a distinct Product entity (with aggregateRating only), so Google never
// sees both on the same node that it wraps in a Review.
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#org`,
      name: "LuffyTV",
      alternateName: ["Luffy TV", "luffyTV", "luffytv", "luffy", "LuffyTV.live"],
      url: SITE_URL,
      logo: { "@type": "ImageObject", url: `${SITE_URL}/logo-transparent.png` },
      description: "Watch anime online free in HD with Tamil, Hindi, Telugu, Bengali dub & English sub on LuffyTV. #1 free anime streaming site in India.",
      sameAs: [
        "https://x.com/TheLuffyTV",
        "https://twitch.tv/theluffytv",
        "https://discord.gg/luffytv",
        "https://discord.gg/GEVes3uhtM",
        "https://youtube.com/@LuffyTV",
        "https://instagram.com/luffytv",
        "https://kick.com/luffytv",
        "https://facebook.com/LuffyTV.ca",
        "https://linktr.ee/luffytv",
        "https://github.com/fahadulalim93-cloud/luffytv-fahad",
      ],
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#app`,
      name: "LuffyTV",
      url: SITE_URL,
      applicationCategory: "EntertainmentApplication",
      operatingSystem: "Web",
      offers: { "@type": "Offer", price: "0", priceCurrency: "INR", description: "Free anime streaming" },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#rated-app`,
      name: "LuffyTV",
      url: SITE_URL,
      applicationCategory: "EntertainmentApplication",
      operatingSystem: "Web",
      aggregateRating: { "@type": "AggregateRating", ratingValue: 5, bestRating: 5, ratingCount: 4 },
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "LuffyTV",
      alternateName: ["Luffy TV", "luffyTV", "luffytv", "luffy"],
      inLanguage: "en",
      publisher: { "@id": `${SITE_URL}/#org` },
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/search/{search_term_string}` },
        "query-input": "required name=search_term_string",
      },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <meta name="referrer" content="origin-when-cross-origin" />
        <meta name="google" content="notranslate" />
        {/* canonical is set per-page via generateMetadata — do NOT set a global canonical here */}
        <link rel="home" href={SITE_URL} />
        {/* Preconnect to proxy worker — saves ~200ms TLS handshake on first m3u8 request */}
        <link rel="preconnect" href={process.env.NEXT_PUBLIC_PROXY_BASE || "https://luffytv-proxy.ggy892767.workers.dev"} />
        <link rel="dns-prefetch" href={process.env.NEXT_PUBLIC_PROXY_BASE || "https://luffytv-proxy.ggy892767.workers.dev"} />
        {/* Preconnect to AniList GraphQL API — used for metadata on every page */}
        <link rel="preconnect" href="https://graphql.anilist.co" />
        <link rel="dns-prefetch" href="https://graphql.anilist.co" />
        {/* Hidden H1 for brand recognition — Google reads H1 to understand the site brand */}
        <h1 className="sr-only">LuffyTV — Watch Anime Online Free in HD — Tamil Hindi Telugu Bengali Dub & English Sub</h1>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
      </head>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} ${spaceMono.variable} ${inter.variable} ${spaceGrotesk.variable} ${outfit.variable} ${karla.variable} antialiased bg-[#000000] text-[#fafafa] selection:bg-[#E63946]/30 selection:text-white`}
      >
        {children}
      </body>
    </html>
  );
}
