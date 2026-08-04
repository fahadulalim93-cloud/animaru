import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { SITE_CONFIG } from "@/lib/seo/config";
import { getRootSchema } from "@/lib/seo/schemas";
import { JsonLd } from "@/components/seo/json-ld";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0F0F0F" },
  ],
};

// ─── ROOT METADATA — applied to EVERY page ─────────────────────
// This is the MOST CRITICAL SEO element for your site.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_CONFIG.primaryDomain),

  title: {
    default: `${SITE_CONFIG.name} — ${SITE_CONFIG.tagline}`,
    template: `%s | ${SITE_CONFIG.name}`,
  },

  description: SITE_CONFIG.description,
  keywords: SITE_CONFIG.keywords,

  authors: [{ name: SITE_CONFIG.name, url: SITE_CONFIG.primaryDomain }],
  creator: SITE_CONFIG.name,
  publisher: SITE_CONFIG.name,

  // Allow full indexing
  robots: {
    index: true,
    follow: true,
    "max-image-preview": "large",
    "max-snippet": -1,
    "max-video-preview": -1,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },

  // Canonical — ALWAYS luffytv.to, never .live or .app
  alternates: {
    canonical: SITE_CONFIG.primaryDomain,
    languages: {
      "x-default": SITE_CONFIG.primaryDomain,
      "en": SITE_CONFIG.primaryDomain,
      "ta": `${SITE_CONFIG.primaryDomain}/tamil-dub`,
      "hi": `${SITE_CONFIG.primaryDomain}/hindi-dub`,
      "te": `${SITE_CONFIG.primaryDomain}/telugu-dub`,
      "bn": `${SITE_CONFIG.primaryDomain}/bengali-dub`,
    },
  },

  // Open Graph
  openGraph: {
    title: `${SITE_CONFIG.name} — ${SITE_CONFIG.tagline}`,
    description: SITE_CONFIG.description,
    url: SITE_CONFIG.primaryDomain,
    siteName: SITE_CONFIG.name,
    locale: SITE_CONFIG.locale,
    type: "website",
    images: [
      {
        url: SITE_CONFIG.ogImage,
        width: SITE_CONFIG.ogImageWidth,
        height: SITE_CONFIG.ogImageHeight,
        alt: `${SITE_CONFIG.name} — Watch Anime Online Free in Tamil, Hindi & English`,
        type: "image/png",
      },
    ],
  },

  // Twitter Card
  twitter: {
    card: "summary_large_image",
    title: `${SITE_CONFIG.name} — Watch Anime Online Free`,
    description: SITE_CONFIG.description,
    images: [SITE_CONFIG.ogImage],
    creator: "@TheLuffyTV",
    site: "@TheLuffyTV",
  },

  // Icons
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },

  applicationName: SITE_CONFIG.name,
  appleWebApp: {
    capable: true,
    title: SITE_CONFIG.name,
    statusBarStyle: "black-translucent",
  },

  category: "entertainment",

  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },

  // Search console verification
  other: {
    "google-site-verification": SITE_CONFIG.verification.google,
    "msvalidate.01": SITE_CONFIG.verification.bing,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* 
          ROOT JSON-LD Schema — Organization + WebSite + SearchAction
          This tells Google: "LuffyTV is an anime streaming site,
          not a Twitch channel or crypto token"
        */}
        <JsonLd data={getRootSchema()} />

        {/* Preconnect for faster loading */}
        <link rel="preconnect" href="https://cdn.example.com" />
        <link rel="dns-prefetch" href="https://cdn.example.com" />

        {/*
          GOOGLE & BING VERIFICATION
          Replace these with your actual codes from:
          - Google: https://search.google.com/search-console → Add property → HTML tag
          - Bing: https://www.bing.com/webmasters → Add site → HTML tag
          
          Once verified, submit your sitemap:
          - Google: https://search.google.com/search-console → Sitemaps → https://luffytv.to/sitemap.xml
          - Bing: https://www.bing.com/webmasters → Sitemaps → https://luffytv.to/sitemap.xml
        */}
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
