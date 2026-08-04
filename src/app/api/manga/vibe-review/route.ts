import { NextRequest, NextResponse } from "next/server";
import { db as prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_VIBES = ["drop", "bold", "great", "recommended"];

/** GET /api/manga/vibe-review?mangaId=&username=
 *  Returns aggregate vibe counts + the requesting user's vibe. */
export async function GET(request: NextRequest) {
  const mangaId = request.nextUrl.searchParams.get("mangaId");
  const username = request.nextUrl.searchParams.get("username");
  if (!mangaId) {
    return NextResponse.json({ error: "mangaId required" }, { status: 400 });
  }
  try {
    const [reviews, userVibe] = await Promise.all([
      prisma.mangaVibeReview.groupBy({
        by: ["vibe"],
        where: { mangaId },
        _count: true,
      }),
      username ? prisma.mangaVibeReview.findUnique({
        where: { mangaId_username: { mangaId, username } },
      }) : null,
    ]);

    const counts: Record<string, number> = { drop: 0, bold: 0, great: 0, recommended: 0 };
    for (const r of reviews) {
      counts[r.vibe] = r._count;
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);

    return NextResponse.json({
      counts,
      total,
      userVibe: userVibe?.vibe || null,
    });
  } catch (err) {
    console.error("[manga/vibe-review] GET error:", err);
    return NextResponse.json({ counts: { drop: 0, bold: 0, great: 0, recommended: 0 }, total: 0, userVibe: null });
  }
}

/** POST /api/manga/vibe-review  body: { mangaId, username, vibe }
 *  vibe: "drop" | "bold" | "great" | "recommended"
 *  Upserts the user's vibe. Returns new aggregate counts. */
export async function POST(request: NextRequest) {
  try {
    const { mangaId, username, vibe } = await request.json();
    if (!mangaId || !username || !vibe) {
      return NextResponse.json({ error: "mangaId, username, vibe required" }, { status: 400 });
    }
    if (!VALID_VIBES.includes(vibe)) {
      return NextResponse.json({ error: "Invalid vibe" }, { status: 400 });
    }

    await prisma.mangaVibeReview.upsert({
      where: { mangaId_username: { mangaId, username } },
      create: { mangaId, username, vibe },
      update: { vibe },
    });

    const reviews = await prisma.mangaVibeReview.groupBy({
      by: ["vibe"],
      where: { mangaId },
      _count: true,
    });

    const counts: Record<string, number> = { drop: 0, bold: 0, great: 0, recommended: 0 };
    for (const r of reviews) {
      counts[r.vibe] = r._count;
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);

    return NextResponse.json({ counts, total, userVibe: vibe });
  } catch (err) {
    console.error("[manga/vibe-review] POST error:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
