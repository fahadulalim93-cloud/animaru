import { NextRequest, NextResponse } from "next/server";
import { createHash, createDecipheriv } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Server-side decryption of AllAnime's tobeparsed field
// This MUST run on the server since it uses Node.js crypto

function decryptTobeparsed(blob: string): Array<{ sourceUrl: string; sourceName: string; type?: string }> {
  try {
    const key = createHash("sha256").update("Xot36i3lK3:v1").digest();
    const buf = Buffer.from(blob, "base64");
    const iv = Buffer.concat([buf.slice(1, 13), Buffer.from("00000002", "hex")]);
    const ciphertext = buf.slice(13, buf.length - 16);
    const decipher = createDecipheriv("aes-256-ctr", key, iv);
    const decrypted = decipher.update(ciphertext).toString() + decipher.final().toString();

    try {
      const parsed = JSON.parse(decrypted);
      if (parsed?.episode?.sourceUrls) return parsed.episode.sourceUrls;
      if (Array.isArray(parsed)) return parsed;
    } catch { /* partially corrupted */ }

    const sourceUrls: Array<{ sourceUrl: string; sourceName: string; type?: string }> = [];
    const urlRegex = /"sourceUrl"\s*:\s*"([^"]+)"/g;
    const nameRegex = /"sourceName"\s*:\s*"([^"]+)"/g;
    const typeRegex = /"type"\s*:\s*"([^"]+)"/g;

    const urls: string[] = [];
    const names: string[] = [];
    const types: string[] = [];

    let match;
    while ((match = urlRegex.exec(decrypted)) !== null) urls.push(match[1]);
    while ((match = nameRegex.exec(decrypted)) !== null) names.push(match[1]);
    while ((match = typeRegex.exec(decrypted)) !== null) types.push(match[1]);

    for (let i = 0; i < urls.length; i++) {
      sourceUrls.push({
        sourceUrl: urls[i],
        sourceName: names[i] || "Unknown",
        type: types[i] || undefined,
      });
    }
    return sourceUrls;
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const tobeparsed = request.nextUrl.searchParams.get("tobeparsed");
  if (!tobeparsed) {
    return NextResponse.json({ error: "tobeparsed parameter required" }, { status: 400 });
  }

  const sources = decryptTobeparsed(tobeparsed);
  return NextResponse.json({ sources });
}
