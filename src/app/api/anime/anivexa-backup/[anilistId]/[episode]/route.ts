/**
 * Anivexa Backup Servers — self-hosted Anivexa-API on the VPS
 *
 * Calls http://169.58.120.196:4000 (self-hosted Anivexa-API) to get
 * stream URLs from 6+ providers: anikoto, anineko, animegg, reanime,
 * 2dhive, anibd.
 *
 * This provides MASSIVE backup when the main sources (anineko.to,
 * anikoto, anichi) fail for a specific anime.
 */

import { NextResponse } from "next/server";

const ANIVEXA_API = process.env.ANIVEXA_API_URL || "http://169.58.120.196:4000";

// Working providers — unique One Piece themed names (no "Vexa" prefix)
const PROVIDERS = [
  { id: "anikoto",  name: "Kaido",     type: "both" },
  { id: "anineko",  name: "Big Mom",   type: "both" },
  { id: "animegg",  name: "Doflamingo",type: "both" },
] as const;

interface AnivexaStream {
  url: string;
  type: string;
  server: string;
  embedUrl?: string;
  referer?: string;
  subtitles?: Array<{ url: string; label?: string }>;
}

interface ServerEntry {
  id: string;
  name: string;
  source: string;
  streamUrl: string;
  type: "sub" | "dub";
  hardsub?: boolean;
  embedUrl?: string;
  referer?: string;
  subtitles?: Array<{ url: string; label?: string }>;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ anilistId: string; episode: string }> }
) {
  const { anilistId, episode } = await params;
  const anilistIdNum = parseInt(anilistId, 10);
  const episodeNum = parseInt(episode, 10);

  if (!anilistIdNum || !episodeNum) {
    return NextResponse.json({ servers: [] });
  }

  const servers: ServerEntry[] = [];

  // Fire all provider requests in parallel
  const fetchPromises = PROVIDERS.map(async (provider) => {
    const results: ServerEntry[] = [];

    // Fetch SUB + DUB in parallel
    const audioModes = provider.type === "both" ? ["sub", "dub"] : ["sub"];

    await Promise.all(
      audioModes.map(async (audio) => {
        try {
          const watchUrl = `${ANIVEXA_API}/watch/${provider.id}/${anilistIdNum}/${audio}/${provider.id}-${episodeNum}`;
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15000);

          const res = await fetch(watchUrl, { signal: controller.signal });
          clearTimeout(timeout);

          if (!res.ok) return;

          const data = await res.json();
          const streams: AnivexaStream[] = data.streams || [];

          for (const stream of streams) {
            // Skip empty URLs
            if (!stream.url && !stream.embedUrl) continue;

            const idx = streams.indexOf(stream);
            const serverId = `anivexa-${provider.id}-${audio}-${idx}`;
            const serverName = `${provider.name} ${audio === "dub" ? "Dub" : "Sub"}`;

            results.push({
              id: serverId,
              name: serverName,
              source: "anivexa",
              streamUrl: stream.url || stream.embedUrl || "",
              type: audio as "sub" | "dub",
              embedUrl: stream.embedUrl,
              referer: stream.referer,
              subtitles: stream.subtitles,
            });
          }
        } catch {
          // Provider failed — skip it
        }
      })
    );

    return results;
  });

  // Wait for all providers (with a global timeout)
  const results = await Promise.allSettled(fetchPromises);
  for (const result of results) {
    if (result.status === "fulfilled") {
      servers.push(...result.value);
    }
  }

  // Deduplicate — by BOTH streamUrl AND server name
  // (the Anivexa API returns multiple streams with the same server name
  // from different sub-providers — we only show ONE per unique name)
  const seenUrls = new Set<string>();
  const seenNames = new Set<string>();
  const deduped = servers.filter((s) => {
    // Skip if exact same URL
    if (seenUrls.has(s.streamUrl)) return false;
    seenUrls.add(s.streamUrl);
    // Skip if exact same name (prevents "Big Mom Sub (AniNeko)" appearing 4x)
    if (seenNames.has(s.name)) return false;
    seenNames.add(s.name);
    return true;
  });

  return NextResponse.json({ servers: deduped });
}
