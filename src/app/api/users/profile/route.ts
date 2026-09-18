import { requireUser } from "@/lib/user-auth-server";
import { PrismaClient } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const prisma = new PrismaClient();

/** PATCH /api/users/profile — update user profile fields */
export async function PATCH(req: Request) {
  const user = await requireUser(req);
  if (!user) {
    return new Response(JSON.stringify({ ok: false, error: "Not authenticated" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  let body: {
    name?: string;
    email?: string;
    bio?: string;
    avatar?: string;
    avatarColor?: string;
    avatarEmoji?: string;
    avatarImage?: string;
    avatarFrame?: string;
    banner?: string;
    bannerImage?: string;
    accentColor?: string;
    tagline?: string;
    favorites?: string[];
  } | null;

  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid request body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const data: any = {};
    if (body?.name !== undefined) data.name = body.name;
    if (body?.email !== undefined) data.email = body.email || null;
    if (body?.bio !== undefined) data.bio = body.bio;
    if (body?.avatar !== undefined) data.avatar = body.avatar;
    if (body?.avatarColor !== undefined) data.avatarColor = body.avatarColor;
    if (body?.avatarEmoji !== undefined) data.avatarEmoji = body.avatarEmoji;
    if (body?.avatarImage !== undefined) data.avatarImage = body.avatarImage;
    if (body?.avatarFrame !== undefined) data.avatarFrame = body.avatarFrame;
    if (body?.banner !== undefined) data.banner = body.banner;
    if (body?.bannerImage !== undefined) data.bannerImage = body.bannerImage;
    if (body?.accentColor !== undefined) data.accentColor = body.accentColor;
    if (body?.tagline !== undefined) data.tagline = body.tagline;
    if (body?.favorites !== undefined) data.favorites = JSON.stringify(body.favorites);

    const updated = await prisma.user.update({
      where: { id: user.id },
      data,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        user: {
          id: updated.id,
          username: updated.username,
          name: updated.name,
          email: updated.email,
          avatar: updated.avatar,
          avatarColor: updated.avatarColor,
          avatarEmoji: updated.avatarEmoji,
          avatarImage: updated.avatarImage,
          avatarFrame: updated.avatarFrame,
          banner: updated.banner,
          bannerImage: updated.bannerImage,
          accentColor: updated.accentColor,
          tagline: updated.tagline,
          bio: updated.bio,
          favorites: updated.favorites ? JSON.parse(updated.favorites) : [],
          xp: updated.xp,
          level: updated.level,
          watchCount: updated.watchCount,
          episodeCount: updated.episodeCount,
          commentCount: updated.commentCount,
          bookmarkCount: updated.bookmarkCount,
        },
      }),
      {
        status: 200,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      }
    );
  } catch (err: any) {
    console.error("[user-profile] Error:", err?.message || err);
    return new Response(JSON.stringify({ ok: false, error: "Server error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
