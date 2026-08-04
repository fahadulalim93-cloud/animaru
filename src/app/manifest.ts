import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LuffyTV — Watch Anime Online Free in HD — Tamil Hindi Telugu Bengali Dub & English Sub",
    short_name: "LuffyTV",
    description: "Watch anime online free in HD with Tamil, Hindi, Telugu, Bengali dub & English sub on LuffyTV.",
    start_url: "https://luffytv.live",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#E63946",
    orientation: "any",
    lang: "en",
    categories: ["entertainment"],
    icons: [
      { src: "/favicon.ico", sizes: "any", type: "image/x-icon" },
      { src: "/logo.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
