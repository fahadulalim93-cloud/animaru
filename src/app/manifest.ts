/**
 * Web App Manifest
 * 
 * This enables PWA install prompt, app icon on home screen,
 * and proper branding in browser UI.
 */

import { MetadataRoute } from "next";
import { SITE_CONFIG } from "@/lib/seo/config";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_CONFIG.name,
    short_name: SITE_CONFIG.shortName,
    description: SITE_CONFIG.description,
    start_url: "/",
    display: "standalone",
    orientation: "portrait-primary",
    scope: "/",
    lang: SITE_CONFIG.language,
    dir: "ltr",
    theme_color: "#E91E63", // Luffy pink/red brand color
    background_color: "#0F0F0F", // Dark background
    icons: [
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    categories: ["entertainment", "video"],
    screenshots: [],
  };
}
