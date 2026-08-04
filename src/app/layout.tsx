import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Mono, Inter, Space_Grotesk, Outfit, Karla } from "next/font/google";
import AntiScrapeClient from "@/components/anti-scrape-client";
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

const SITE_URL = "https://luffytv.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Luffy TV — Watch Anime, Movies & TV Shows Free in HD",
    template: "%s | Luffy TV",
  },
  description:
    "Stream anime, movies, TV shows, manga & light novels free in HD. Subbed & dubbed anime, trending movies and popular series — all in one place, no signup required.",
  applicationName: "Luffy TV",
  keywords: [
    "anime", "watch anime online", "free anime streaming", "movies",
    "TV shows", "manga", "light novels", "HD anime", "trending anime",
    "Luffy TV", "streaming", "subbed", "dubbed", "watch movies free",
    "watch TV shows online", "anime online free",
  ],
  authors: [{ name: "Luffy TV" }],
  creator: "Luffy TV",
  publisher: "Luffy TV",
  alternates: { canonical: SITE_URL },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  openGraph: {
    type: "website",
    siteName: "Luffy TV",
    title: "Luffy TV — Watch Anime, Movies & TV Shows Free in HD",
    description:
      "Stream anime, movies, TV shows, manga & light novels free in HD. Subbed & dubbed — all in one place.",
    url: SITE_URL,
    locale: "en_US",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Luffy TV" }],
  },
  twitter: {
    card: "summary_large_image",
    site: "@luffytv",
    title: "Luffy TV — Watch Anime, Movies & TV Shows Free in HD",
    description: "Stream anime, movies, TV shows, manga & novels free in HD.",
    images: ["/og.png"],
  },
  category: "entertainment",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
    shortcut: "/favicon.ico",
  },
};

// Structured data — Organization + WebSite with a sitelinks SearchAction.
// The SearchAction is what makes Google render a search box under the site's
// result ("sitelinks search box"), a strong signal for branded queries.
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#org`,
      name: "Luffy TV",
      url: SITE_URL,
      logo: `${SITE_URL}/logo.svg`,
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "Luffy TV",
      publisher: { "@id": `${SITE_URL}/#org` },
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/#search/{search_term_string}` },
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
        <meta name="referrer" content="no-referrer" />
        <link rel="canonical" href={SITE_URL} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
      </head>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} ${spaceMono.variable} ${inter.variable} ${spaceGrotesk.variable} ${outfit.variable} ${karla.variable} antialiased bg-[#000000] text-[#fafafa] selection:bg-[#E63946]/30 selection:text-white`}
      >
        <AntiScrapeClient />
        {children}
      </body>
    </html>
  );
}
