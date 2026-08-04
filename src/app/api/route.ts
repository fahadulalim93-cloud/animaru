import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    name: "Luffy TV API",
    version: "2.0",
    endpoints: {
      home: "/api/anime/home",
      search: "/api/anime/search?q=...",
      info: "/api/anime/info?id=...",
      episodes: "/api/anime/episodes?id=...",
      watch: "/api/anime/watch?id=...&episode=...&translation=sub|dub",
      genre: "/api/anime/genre?genre=...",
      stream: "/api/stream?url=...",
      decrypt: "/api/anime/decrypt?tobeparsed=...",
    },
  });
}
