// Embed Server Providers for LuffyTV — Pokemon-named servers
//
// CLEAN PROVIDER LIST:
//
// Anime Servers (SUB/DUB) in priority order:
//   0. Miku          (YumeZone/Miruro)  — AniList ID — Miruro miku provider, HLS+embed, auto-switch
//   1. Pikachu       (VidNest Anime)    — AniList ID — sub/dub/hindi, iframe
//   2. Eevee         (VidNest AnimePahe) — AniList ID — sub/dub, iframe
//   3. Charizard     (Videasy)          — AniList ID — auto sub/dub, iframe
//   4. Zoro          (YumeZone/Megaplay) — AniList ID — Megaplay embed, sub+dub
//   5. Kiwi          (YumeZone/Miruro)  — AniList ID — Miruro kiwi provider, HLS
//   6. Arc           (YumeZone/Miruro)  — AniList ID — Miruro arc provider, HLS
//   7. Umbreon       (AniVexa/AniNeko)  — AniList ID — HLS embeds
//   8. Mewtwo        (AniVexa/AllAnime) — AniList ID — 6+ Sources, MP4+Iframe
//   9. Bulbasaur     (AnimeX)           — AniList ID — GraphQL+REST, HLS proxy
//
// Miruro V3 Servers (SEPARATE route — NOT in instant-servers):
//   These use the NEW api.luffytv.online backend with proper sub/dub handling
//   and proxy wrapping. Each provider gets its own entry.
//   10. Miruro Kiwi    (Miruro V3)  — AniList ID — HLS, sub+dub, uwucdn proxy
//   11. Miruro Pewe    (Miruro V3)  — AniList ID — HLS, sub+dub
//   12. Miruro Bee     (Miruro V3)  — AniList ID — HLS, sub only
//   13. Miruro Bonk    (Miruro V3)  — AniList ID — HLS, sub+dub
//   14. Miruro Ally    (Miruro V3)  — AniList ID — HLS, sub+dub
//   15. Miruro Moo     (Miruro V3)  — AniList ID — HLS, sub+dub
//
// Hindi Servers:
//   Charmander      (AniXtv)           — AniList ID — Hindi dub
//   Flareon         (VidNest Hindi)    — AniList ID — Hindi dub
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
  name: "Sigma",
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

const yumezoneZoro: EmbedServer = {
  id: "yz-zoro",
  name: "Theta",
  priority: 4,
  supportsSub: true,
  supportsDub: true,
  supportsHindi: false,
  idType: "anilist",
  color: "#22C55E",
  category: "anime",
  streamType: "iframe",
  noSandbox: true,
  generateUrl: (p) => {
    if (!p.anilistId) return "";
    const lang = p.translation === "dub" ? "dub" : "sub";
    return `https://megaplay.buzz/stream/ani/${p.anilistId}/${p.episode}/${lang}`;
  },
};

const yumezoneKiwi: EmbedServer = {
  id: "yz-kiwi",
  name: "Lambda",
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
  name: "Kappa",
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
  name: "Epsilon",
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

// =====================================================
// ANIME SERVERS — Pokemon-named, priority order
// =====================================================

const vidnestAnime: EmbedServer = {
  id: "vidnest-anime",
  name: "Delta",
  priority: 0,
  supportsSub: true,
  supportsDub: true,
  supportsHindi: true,
  idType: "anilist",
  color: "#FFD700",
  category: "anime",
  streamType: "iframe",
  generateUrl: (p) => {
    if (!p.anilistId) return "";
    const lang = p.translation === "hindi" ? "hindi" : p.translation === "dub" ? "dub" : "sub";
    return `https://vidnest.fun/anime/${p.anilistId}/${p.episode}/${lang}`;
  },
};

const vidnestAnimepahe: EmbedServer = {
  id: "vidnest-animepahe",
  name: "Gamma",
  priority: 1,
  supportsSub: true,
  supportsDub: true,
  supportsHindi: false,
  idType: "anilist",
  color: "#C084FC",
  category: "anime",
  streamType: "iframe",
  generateUrl: (p) => {
    if (!p.anilistId) return "";
    const lang = p.translation === "dub" ? "dub" : "sub";
    return `https://vidnest.fun/animepahe/${p.anilistId}/${p.episode}/${lang}`;
  },
};

const videasyAnime: EmbedServer = {
  id: "videasy-anime",
  name: "Omega",
  priority: 2,
  supportsSub: true,
  supportsDub: true,
  supportsHindi: false,
  idType: "anilist",
  color: "#F97316",
  category: "anime",
  streamType: "iframe",
  generateUrl: (p) => {
    if (!p.anilistId) return "";
    return `https://player.videasy.net/anime/${p.anilistId}/${p.episode}?nextEpisode=true&autoplayNextEpisode=true&episodeSelector=true&overlay=true&color=E63946`;
  },
};

// =====================================================
// ANIVEXA SERVERS — Only AniNeko (iframe) + AllAnime
// Public API: https://anivexa-api-tawny.vercel.app
// =====================================================

const ANIVEXA_PROVIDER_CONFIG: Array<{ id: string; name: string; color: string; priority: number; tip: string }> = [
  { id: "anineko", name: "Zeta",  color: "#1E293B", priority: 4, tip: "HLS Embeds, Reliable" },
  { id: "allmanga", name: "Iota",  color: "#6366F1", priority: 5, tip: "6+ Sources, MP4+Iframe" },
];

const anivexaServers: EmbedServer[] = ANIVEXA_PROVIDER_CONFIG.map((prov) => ({
  id: `anivexa-${prov.id}`,
  name: prov.name,
  priority: prov.priority,
  supportsSub: true,
  supportsDub: true,
  supportsHindi: false,
  idType: "anilist" as const,
  color: prov.color,
  category: "anime" as const,
  streamType: "iframe" as const,
  noSandbox: true,
  generateUrl: (p: EmbedUrlParams) => {
    if (!p.anilistId) return "";
    const lang = p.translation === "dub" ? "dub" : "sub";
    return `/api/anivexa/watch?anilistId=${p.anilistId}&episode=${p.episode}&type=${lang}&provider=${prov.id}`;
  },
}));

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
  name: "Phi",
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
  { id: "kiwi",  name: "Alpha-1",  color: "#A3E635", priority: 8,  supportsDub: true },
  { id: "pewe",  name: "Alpha-2",  color: "#34D399", priority: 8.1, supportsDub: true },
  { id: "bee",   name: "Alpha-3",   color: "#FBBF24", priority: 8.2, supportsDub: false },
  { id: "bonk",  name: "Alpha-4",  color: "#F472B6", priority: 8.3, supportsDub: true },
  { id: "ally",  name: "Alpha-5",  color: "#60A5FA", priority: 8.4, supportsDub: true },
  { id: "moo",   name: "Alpha-6",   color: "#C084FC", priority: 8.5, supportsDub: true },
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
// HINDI SERVERS — Pokemon-named
// =====================================================

const anixtvHindi: EmbedServer = {
  id: "anixtv-hindi",
  name: "Rho",
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
  name: "Tau",
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
  yumezoneMiku,       // Miku (YumeZone/Miruro — best provider, auto-switch)
  vidnestAnime,       // Pikachu
  vidnestAnimepahe,   // Eevee
  videasyAnime,       // Charizard
  yumezoneZoro,       // Zoro (YumeZone/Megaplay embed)
  ...anivexaServers,  // Umbreon(AniNeko), Mewtwo(AllAnime)
  animexServer,       // Bulbasaur(AnimeX)
  ...miruroV3Servers, // Miruro V3: Kiwi, Pewe, Bee, Bonk, Ally, Moo (SEPARATE route — replaces old yz-kiwi/arc/bee)
];

const HINDI_SERVERS: EmbedServer[] = [
  anixtvHindi,       // Charmander
  vidnestHindi,      // Flareon
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
  return serverId.startsWith("animex-") || serverId.startsWith("anivexa-") || serverId.startsWith("yz-") || serverId.startsWith("miruro-v3-");
}

/**
 * Check if a server is from AniVexa (needs availability checking)
 */
export function isAnivexaServer(serverId: string): boolean {
  return serverId.startsWith("anivexa-");
}

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
export function getAnivexaProviderTip(serverId: string): string {
  const prov = ANIVEXA_PROVIDER_CONFIG.find(p => `anivexa-${p.id}` === serverId);
  return prov?.tip || "";
}
