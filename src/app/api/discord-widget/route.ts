import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/discord-widget
 * Returns Discord server info for the sidebar widget.
 * Uses the public invite API (no bot token needed).
 *
 * If the server widget is enabled, also fetches live member count.
 * Otherwise, returns the server name + icon from the invite API.
 */
const DISCORD_INVITE_CODE = "SdFB3HxDH5";
const DISCORD_GUILD_ID = "887607823805087754";

// Cache for 2 minutes (Discord API rate limits)
let cache: { data: any; ts: number } | null = null;
const CACHE_TTL = 120_000; // 2 min

export async function GET() {
  try {
    // Return cached data if fresh
    if (cache && Date.now() - cache.ts < CACHE_TTL) {
      return NextResponse.json(cache.data);
    }

    // Fetch invite data (gives server name + icon)
    const [inviteRes, widgetRes] = await Promise.allSettled([
      fetch(
        `https://discord.com/api/v9/invites/${DISCORD_INVITE_CODE}?with_counts=true&with_expiration=true`,
        { signal: AbortSignal.timeout(5000) }
      ),
      fetch(`https://discord.com/api/guilds/${DISCORD_GUILD_ID}/widget.json`, {
        signal: AbortSignal.timeout(5000),
      }),
    ]);

    let serverName = "LuffyTV";
    let serverIcon = null;
    let onlineCount = null;
    let memberCount = null;
    let onlineMembers: any[] = [];

    // Parse invite response
    if (inviteRes.status === "fulfilled" && inviteRes.value.ok) {
      const invite = await inviteRes.value.json();
      serverName = invite.guild?.name || "LuffyTV";
      serverIcon = invite.guild?.icon
        ? `https://cdn.discordapp.com/icons/${DISCORD_GUILD_ID}/${invite.guild.icon}.png?size=64`
        : null;
      memberCount = invite.approx_member_count || null;
      onlineCount = invite.approx_presence_count || null;
    }

    // Parse widget response (gives live online count + member list)
    if (widgetRes.status === "fulfilled" && widgetRes.value.ok) {
      const widget = await widgetRes.value.json();
      serverName = widget.name || serverName;
      onlineCount = widget.presence_count || onlineCount;
      // Get up to 8 online members for display
      onlineMembers = (widget.members || []).slice(0, 8).map((m: any) => ({
        username: m.username,
        avatar: m.avatar_url,
        status: m.status || "online",
        game: m.game?.name || null,
      }));
      // If widget gives us a presence count, use it as member count too
      if (!memberCount && widget.presence_count) {
        memberCount = widget.presence_count;
      }
    }

    const data = {
      serverName,
      serverIcon,
      inviteUrl: `https://discord.gg/${DISCORD_INVITE_CODE}`,
      onlineCount,
      memberCount,
      members: onlineMembers,
      widgetEnabled: widgetRes.status === "fulfilled" && widgetRes.value.ok,
    };

    cache = { data, ts: Date.now() };
    return NextResponse.json(data);
  } catch (error) {
    // Fallback to static data
    return NextResponse.json({
      serverName: "LuffyTV",
      serverIcon: null,
      inviteUrl: "https://discord.gg/SdFB3HxDH5",
      onlineCount: null,
      memberCount: null,
      members: [],
      widgetEnabled: false,
    });
  }
}
