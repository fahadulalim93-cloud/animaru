/**
 * Robots.txt Configuration
 * 
 * This replaces the static public/robots.txt with a dynamic one
 * that includes the sitemap URL (critical for crawlers finding it).
 */

import { MetadataRoute } from "next";
import { SITE_CONFIG } from "@/lib/seo/config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "Googlebot",
        allow: "/",
        crawlDelay: 1,
      },
      {
        userAgent: "Bingbot",
        allow: "/",
        crawlDelay: 2,
      },
      {
        userAgent: "YandexBot",
        allow: "/",
        crawlDelay: 3,
      },
      {
        userAgent: "Twitterbot",
        allow: "/",
      },
      {
        userAgent: "facebookexternalhit",
        allow: "/",
      },
      {
        userAgent: "*",
        allow: "/",
        crawlDelay: 5,
        disallow: ["/api/", "/_next/"],
      },
    ],
    sitemap: `${SITE_CONFIG.primaryDomain}/sitemap.xml`,
    host: SITE_CONFIG.primaryDomain,
  };
}
