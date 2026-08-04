import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/ai/chat
 * Body: { message: string, chapterName: string, chapterContent: string, history: [{role, content}] }
 *
 * AI assistant that answers questions about the current chapter.
 */
export async function POST(req: NextRequest) {
  try {
    const { message, chapterName, chapterContent, history } = await req.json();
    if (!message) {
      return NextResponse.json({ error: "Missing message" }, { status: 400 });
    }

    const truncatedContent = chapterContent
      ? (chapterContent.length > 6000 ? chapterContent.slice(0, 6000) + "..." : chapterContent)
      : "";

    const zai = await ZAI.create();

    const systemPrompt = `You are a helpful reading assistant for novels. The reader is currently reading "${chapterName || "a novel"}".

Here is the chapter content for context:
${truncatedContent}

Answer the reader's questions based ONLY on the provided chapter content. If they ask about something not in this chapter, politely say you can only discuss the current chapter. Keep answers concise (1-3 sentences unless asked for detail). Be engaging and literary in tone.`;

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...(Array.isArray(history) ? history.slice(-6) : []),
      { role: "user", content: message },
    ];

    const response = await zai.chat.completions.create({
      model: "glm-4-flash",
      messages,
      temperature: 0.7,
      max_tokens: 500,
    });

    const reply = response.choices[0]?.message?.content || "";
    return NextResponse.json({ reply });
  } catch (err: any) {
    console.error("[AI chat] error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to get AI response" },
      { status: 500 },
    );
  }
}
