import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/ai/summarize
 * Body: { chapterName: string, content: string }
 *
 * Generates a concise summary of a novel chapter using the z-ai-web-dev-sdk.
 */
export async function POST(req: NextRequest) {
  try {
    const { chapterName, content } = await req.json();
    if (!content || typeof content !== "string") {
      return NextResponse.json({ error: "Missing chapter content" }, { status: 400 });
    }

    const truncated = content.length > 8000 ? content.slice(0, 8000) + "..." : content;

    const zai = await ZAI.create();
    const response = await zai.chat.completions.create({
      model: "glm-4-flash",
      messages: [
        {
          role: "system",
          content: `You are a literary assistant that summarizes novel chapters. Write a concise, engaging summary in 2-3 short paragraphs (150-250 words total). Cover the key events, character developments, and any important revelations. Do NOT spoil future chapters — only summarize what happens in THIS chapter. Write in present tense, third person. Do not use headers or bullet points — just flowing paragraphs.`,
        },
        {
          role: "user",
          content: `Summarize this chapter:\n\nChapter: ${chapterName || "Untitled"}\n\n${truncated}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 400,
    });

    const summary = response.choices[0]?.message?.content || "";
    return NextResponse.json({ summary });
  } catch (err: any) {
    console.error("[AI summarize] error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to generate summary" },
      { status: 500 },
    );
  }
}
