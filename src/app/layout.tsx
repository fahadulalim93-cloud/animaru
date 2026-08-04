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

// ─── Viewport (separate from metadata per Next.js 14+) ────────
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0F0F0F" },
  ],
};

// ─── Root Metadata — applied to EVERY page ─────────────────────
// This is the MOST CRITICAL SEO element. It sets up:
// - Title template (page title + "| LuffyTV")
// - Default description, keywords
// - Canonical URL pointing to luffytv.to (NOT .live)
// - Open Graph + Twitter Card defaults
// - robots directives allowing full indexing
// - alternate languages (future i18n)

export const metadata: Metadata = {
  metadataBase: new URL(SITE_CONFIG.primaryDomain),

  // Title template: child pages override, this adds "| LuffyTV"
  title: {
    default: `${SITE_CONFIG.name} — ${SITE_CONFIG.tagline}`,
    template: `%s | ${SITE_CONFIG.name}`,
  },

  description: SITE_CONFIG.description,
  keywords: SITE_CONFIG.keywords,

  authors: [{ name: SITE_CONFIG.name, url: SITE_CONFIG.primaryDomain }],
  creator: SITE_CONFIG.name,
  publisher: SITE_CONFIG.name,

  //robots: Allow full indexing, large snippets, video previews
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

  // Canonical URL — ALWAYS luffytv.to, never .live
  alternates: {
    canonical: SITE_CONFIG.primaryDomain,
    languages: {
      "en-US": SITE_CONFIG.primaryDomain,
    },
  },

  // Open Graph — for Facebook, Discord, LinkedIn shares
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
        alt: `${SITE_CONFIG.name} — Watch Anime Online Free`,
        type: "image/png",
      },
    ],
  },

  // Twitter Card — for Twitter/X shares
  twitter: {
    card: "summary_large_image",
    title: `${SITE_CONFIG.name} — Watch Anime Online Free`,
    description: SITE_CONFIG.description,
    images: [SITE_CONFIG.ogImage],
    creator: "@LuffyTV",
    site: "@LuffyTV",
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

  // App info
  applicationName: SITE_CONFIG.name,
  appleWebApp: {
    capable: true,
    title: SITE_CONFIG.name,
    statusBarStyle: "black-translucent",
  },

  // Category
  category: "entertainment",

  // Format detection
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
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
          Root JSON-LD Schema — Organization + WebSite + SearchAction
          This is THE most important schema. It enables:
          1. Knowledge Panel in Google/Bing
          2. Sitelinks Search Box
          3. Brand entity recognition
        */}
        <JsonLd data={getRootSchema()} />

        {/* Preconnect to CDN for faster image loading */}
        <link rel="preconnect" href="https://cdn.example.com" />
        <link rel="dns-prefetch" href="https://cdn.example.com" />

        {/* 
          Verify domain ownership (replace with actual verification codes)
          <meta name="google-site-verification" content="YOUR_CODE" />
          <meta name="msvalidate.01" content="YOUR_BING_CODE" />
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
