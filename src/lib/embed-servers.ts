// Server Providers for LuffyTV — One Piece-named servers
//
// Anime Servers (SUB/DUB) — HLS only, no embed/iframe:
//   0. Luffy         (YumeZone/Miruro Miku) — AniList ID — HLS, sub+dub, auto-switch
//   1. Brook         (YumeZone/Miruro Kiwi) — AniList ID — HLS, sub+dub
//   2. Jinbe         (YumeZone/Miruro Arc)  — AniList ID — HLS, sub+dub
//   3. Law           (YumeZone/Miruro Bee)  — AniList ID — HLS, sub only
//   4. Franky        (AnimeX)              — AniList ID — GraphQL+REST, HLS proxy
//
// Miruro V3 Servers (SEPARATE route — NOT in instant-servers):
//   5. Kidd          (Miruro V3 Kiwi)  — AniList ID — HLS, sub+dub
//   6. Bonney        (Miruro V3 Pewe)  — AniList ID — HLS, sub+dub
//   7. Bege          (Miruro V3 Bee)   — AniList ID — HLS, sub only
//   8. Urouge        (Miruro V3 Bonk)  — AniList ID — HLS, sub+dub
//   9. Apoo          (Miruro V3 Ally)  — AniList ID — HLS, sub+dub
//   10. Drake        (Miruro V3 Moo)   — AniList ID — HLS, sub+dub
//
// Hindi Servers (embed/iframe allowed):
//   Shanks         (AniXtv)        — AniList ID — Hindi dub, iframe
//   Rayleigh       (VidNest Hindi) — AniList ID — Hindi dub, iframe
//
// TMDB Servers for Movies/TV kept separately

export interface EmbedServer {
  id: string;
  name: string;
  priority: number;
  supportsSub: boolean;
  supportsDub: boolean;
  supportsHindi: boolean;
  idType: "tmdb" | "anilist" | "mal" | "session";
  color: string;
  category: "anime" | "tmdb" | "hindi";
  noSandbox?: boolean;
  streamType?: "iframe" | "hls";
  generateUrl: (params: EmbedUrlParams) => string;
}

export interface EmbedUrlParams {
  anilistId?: number;
  malId?: number;
  tmdbId?: number;
  imdbId?: string;
  episode: number;
  season?: number;
  translation: "sub" | "dub" | "hindi";
  title?: string;
  session?: string;
}

// =====================================================
// YUMEZONE SERVERS — Miruro-based with proper AniList ID mapping
// These servers use the /api/anime/yumezone/watch route which:
// 1. Maps AniList ID -> Miruro episodes -> provider episode IDs
// 2. Fetches correct m3u8/HLS streams with proper headers
// 3. Routes through CDN proxy for CORS-free playback
// =====================================================

const yumezoneMiku: EmbedServer = {
  id: "yz-miku",
  name: "Luffy",
  priority: 0,
  supportsSub: true,
  supportsDub: true,
  supportsHindi: false,
  idType: "anilist",
  color: "#00D4AA",
  category: "anime",
  streamType: "hls",
  noSandbox: true,
  generateUrl: (p) => {
    if (!p.anilistId) return "";
    const type = p.translation === "dub" ? "dub" : "sub";
    return `/api/anime/yumezone/watch?anilistId=${p.anilistId}&episode=${p.episode}&provider=miku&type=${type}`;
  },
};

// REMOVED: yumezoneZoro (Usopp) — iframe/embed server removed per user request
// Only HLS servers are kept for anime. Embed servers kept ONLY for Hindi.

const yumezoneKiwi: EmbedServer = {
  id: "yz-kiwi",
  name: "Brook",
  priority: 5,
  supportsSub: true,
  supportsDub: true,
  supportsHindi: false,
  idType: "anilist",
  color: "#A3E635",
  category: "anime",
  streamType: "hls",
  noSandbox: true,
  generateUrl: (p) => {
    if (!p.anilistId) return "";
    const type = p.translation === "dub" ? "dub" : "sub";
    return `/api/anime/yumezone/watch?anilistId=${p.anilistId}&episode=${p.episode}&provider=kiwi&type=${type}`;
  },
};

const yumezoneArc: EmbedServer = {
  id: "yz-arc",
  name: "Jinbe",
  priority: 6,
  supportsSub: true,
  supportsDub: true,
  supportsHindi: false,
  idType: "anilist",
  color: "#818CF8",
  category: "anime",
  streamType: "hls",
  noSandbox: true,
  generateUrl: (p) => {
    if (!p.anilistId) return "";
    const type = p.translation === "dub" ? "dub" : "sub";
    return `/api/anime/yumezone/watch?anilistId=${p.anilistId}&episode=${p.episode}&provider=arc&type=${type}`;
  },
};

const yumezoneBee: EmbedServer = {
  id: "yz-bee",
  name: "Law",
  priority: 7,
  supportsSub: true,
  supportsDub: false,
  supportsHindi: false,
  idType: "anilist",
  color: "#FBBF24",
  category: "anime",
  streamType: "hls",
  noSandbox: true,
  generateUrl: (p) => {
    if (!p.anilistId) return "";
    const type = p.translation === "dub" ? "dub" : "sub";
    return `/api/anime/yumezone/watch?anilistId=${p.anilistId}&episode=${p.episode}&provider=bee&type=${type}`;
  },
};

// REMOVED: All embed/iframe anime servers (VidNest, VidNest AnimePahe, Videasy, AniVexa)
// per user request — no embed servers for anime, only for Hindi.
// These were: Zoro (vidnest-anime), Nami (vidnest-animepahe), Sanji (videasy-anime),
// Chopper (anivexa-anineko), Robin (anivexa-allmanga)

// =====================================================
// ANIMEX SERVER — Single server that auto-races providers
// Uses GraphQL for AniList ID → slug mapping
// Then REST API for episodes/servers/sources
// All streams proxied through /api/animex/proxy
//
// Provider (CB) mapping with correct headers:
//   beep  — HLS, Default sub, CDN: bd.24stream.xyz
//   mimi  — HLS PNG-TS, Default dub, CDN: hawk.24stream.xyz
//   vee   — DASH, CDN: cdn.animeonsen.xyz
//   yuki  — HLS .jpg-TS, CDN: s2.cinewave2.site
//   miku  — HLS .txt, Best quality, CDN: sxic.oceancrestdigital.shop
//   neko  — MP4, CDN: neko.yokai.cfd
//   huzz  — HLS, CDN: s2.vidhosters.com
//   mochi — MP4 token, CDN: tools.fast4speed.rsvp
//   uwu   — HLS .txt, CDN: sxic.oceancrestdigital.shop
//   koto  — HLS .txt, CDN: sxic.oceancrestdigital.shop
//   kiwi  — HLS CF-protected, CDN: anidb.app
//   kami  — HLS alt
// =====================================================

const animexServer: EmbedServer = {
  id: "animex-auto",
  name: "Franky",
  priority: 6,
  supportsSub: true,
  supportsDub: true,
  supportsHindi: false,
  idType: "anilist",
  color: "#4ADE80",
  category: "anime",
  streamType: "hls",
  noSandbox: true,
  generateUrl: (p) => {
    if (!p.anilistId) return "";
    const lang = p.translation === "dub" ? "dub" : "sub";
    return `/api/animex/watch?anilistId=${p.anilistId}&episode=${p.episode}&type=${lang}`;
  },
};

// =====================================================
// MIRURO V3 SERVERS — Using NEW api.luffytv.online backend
// SEPARATE ROUTE — NOT part of instant-servers!
//
// These servers hit the dedicated /api/anime/miruro-v3/servers route
// which calls api.luffytv.online directly. Each Miruro provider
// (kiwi, pewe, bee, bonk, ally, moo) gets its own EmbedServer entry.
//
// Key differences from YumeZone servers:
//   - Uses api.luffytv.online (NEW API v3.0) instead of miruro.tv pipe
//   - Has its OWN route (/api/anime/miruro-v3/servers/...)
//   - NOT in instant-servers (separate route for isolation)
//   - Sub/dub handled carefully — each checked separately per provider
//   - Proxy wrapping uses wrapM3u8UrlWithReferer for HLS streams
// =====================================================

const MIRURO_V3_PROVIDERS: Array<{
  id: string;      // Provider ID for the API (kiwi, pewe, bee, etc.)
  name: string;    // Display name
  color: string;
  priority: number;
  supportsDub: boolean;  // Some providers only have sub
}> = [
  { id: "kiwi",  name: "Kidd",    color: "#A3E635", priority: 8,  supportsDub: true },
  { id: "pewe",  name: "Bonney",   color: "#34D399", priority: 8.1, supportsDub: true },
  { id: "bee",   name: "Bege",     color: "#FBBF24", priority: 8.2, supportsDub: false },
  { id: "bonk",  name: "Urouge",   color: "#F472B6", priority: 8.3, supportsDub: true },
  { id: "ally",  name: "Apoo",     color: "#60A5FA", priority: 8.4, supportsDub: true },
  { id: "moo",   name: "Drake",    color: "#C084FC", priority: 8.5, supportsDub: true },
];

const miruroV3Servers: EmbedServer[] = MIRURO_V3_PROVIDERS.map((prov) => ({
  id: `miruro-v3-${prov.id}`,
  name: prov.name,
  priority: prov.priority,
  supportsSub: true,
  supportsDub: prov.supportsDub,
  supportsHindi: false,
  idType: "anilist" as const,
  color: prov.color,
  category: "anime" as const,
  streamType: "hls" as const,
  noSandbox: true,
  generateUrl: (p: EmbedUrlParams) => {
    if (!p.anilistId) return "";
    // Sub/dub: pass as query param so the route fetches correct episode list
    const type = p.translation === "dub" ? "dub" : "sub";
    // This route is SEPARATE from instant-servers — it has its own endpoint
    return `/api/anime/miruro-v3/servers/${p.anilistId}/${p.episode}?provider=${prov.id}&type=${type}`;
  },
}));

// =====================================================
// HINDI SERVERS — One Piece-named
// =====================================================

const anixtvHindi: EmbedServer = {
  id: "anixtv-hindi",
  name: "Shanks",
  priority: 0,
  supportsSub: false,
  supportsDub: false,
  supportsHindi: true,
  idType: "anilist",
  color: "#FF6B35",
  category: "hindi",
  // noSandbox removed — we proxy through CF worker which sets ALLOWALL
  streamType: "iframe",
  generateUrl: (p) => {
    if (!p.anilistId) return "";
    const title = p.title ? encodeURIComponent(p.title) : "Anime";
    return `https://anixtv.in/anime-watch?action=hindi_1_player&id=${p.anilistId}&season=1&episode=${p.episode}&title=${title}`;
  },
};

const vidnestHindi: EmbedServer = {
  id: "vidnest-hindi",
  name: "Rayleigh",
  priority: 1,
  supportsSub: false,
  supportsDub: false,
  supportsHindi: true,
  idType: "anilist",
  color: "#F97316",
  category: "hindi",
  streamType: "iframe",
  generateUrl: (p) => {
    if (!p.anilistId) return "";
    return `https://vidnest.fun/anime/${p.anilistId}/${p.episode}/hindi`;
  },
};

// =====================================================
// TMDB SERVERS — Movies/TV Shows
//
// NOTE: Movies/TV no longer use embed iframes. Stream playback for
// movies and TV now goes through direct Vidlink + Moviebox scraping
// (see src/lib/vidlink-api.ts and src/lib/moviebox-api.ts). The
// MovieWatchPage and TVWatchPage components render a <video> element
// with direct MP4/HLS sources instead of an iframe.
// =====================================================

const TMDB_SERVERS: EmbedServer[] = [];

// =====================================================
// ALL SERVERS
// =====================================================

const ANIME_SERVERS: EmbedServer[] = [
  yumezoneMiku,       // Luffy (YumeZone/Miruro Miku — best provider, auto-switch)
  yumezoneKiwi,       // Brook (YumeZone/Miruro Kiwi)
  yumezoneArc,        // Jinbe (YumeZone/Miruro Arc)
  yumezoneBee,        // Law (YumeZone/Miruro Bee)
  animexServer,       // Franky (AnimeX)
  ...miruroV3Servers, // Kidd, Bonney, Bege, Urouge, Apoo, Drake (Miruro V3)
];

const HINDI_SERVERS: EmbedServer[] = [
  anixtvHindi,       // Shanks (AniXtv)
  vidnestHindi,      // Rayleigh (VidNest Hindi)
];

const ALL_SERVERS: EmbedServer[] = [
  ...ANIME_SERVERS,
  ...HINDI_SERVERS,
  ...TMDB_SERVERS,
];

/**
 * Get servers available for Anime content (SUB/DUB)
 */
export function getAnimeServers(): EmbedServer[] {
  return ANIME_SERVERS;
}

/**
 * Get servers available for Hindi Dub
 */
export function getHindiServers(): EmbedServer[] {
  return HINDI_SERVERS;
}

/**
 * Get servers available for Movie/TV content
 */
export function getTmdbServers(): EmbedServer[] {
  return TMDB_SERVERS.map((s, i) => ({
    ...s,
    name: `Server ${i + 1}`,
    priority: i,
  }));
}

/**
 * Get all servers
 */
export const EMBED_SERVERS = ALL_SERVERS;

/**
 * Generate embed URL for a specific server and episode
 */
export function getEmbedUrl(serverId: string, params: EmbedUrlParams): string {
  const server = ALL_SERVERS.find(s => s.id === serverId);
  if (!server) return "";
  return server.generateUrl(params);
}

/**
 * Check if any Hindi Dub server is available
 */
export function hasHindiSupport(anilistId?: number): boolean {
  if (!anilistId) return false;
  return HINDI_SERVERS.length > 0;
}

/**
 * Check if a server uses HLS (M3U8) streaming instead of iframe
 */
export function isHlsServer(serverId: string): boolean {
  return serverId.startsWith("animex-") || serverId.startsWith("yz-") || serverId.startsWith("miruro-v3-");
}

/**
 * Check if a server is from AniVexa (needs availability checking)
 */
// REMOVED: isAnivexaServer — AniVexa embed servers removed per user request

/**
 * Check if a server is from AnimeX (needs availability checking)
 */
export function isAnimexServer(serverId: string): boolean {
  return serverId.startsWith("animex-");
}

/**
 * Check if a server is from Miruro V3 (separate route, NOT in instant-servers)
 */
export function isMiruroV3Server(serverId: string): boolean {
  return serverId.startsWith("miruro-v3-");
}

/**
 * Get the Miruro V3 provider name from a server ID
 */
export function getMiruroV3Provider(serverId: string): string {
  if (!serverId.startsWith("miruro-v3-")) return "";
  return serverId.replace("miruro-v3-", "");
}

/**
 * Get the tip/label for an anivexa provider
 */
// REMOVED: getAnivexaProviderTip — AniVexa embed servers removed per user request
