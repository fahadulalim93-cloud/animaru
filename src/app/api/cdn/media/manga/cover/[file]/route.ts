import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { existsSync } from "fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file } = await params;
  if (file.includes("/") || file.includes("..")) {
    return NextResponse.json({ error: "Invalid file" }, { status: 400 });
  }
  const filePath = `/data/luffytv-cdn-data/images/manga/cover/${file}`;
  if (!existsSync(filePath)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const buffer = await readFile(filePath);
    const ext = file.split(".").pop()?.toLowerCase();
    const contentType = ext === "avif" ? "image/avif" : ext === "webp" ? "image/webp" : "image/jpeg";
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Read error" }, { status: 500 });
  }
}
