import { NextResponse } from "next/server";

// ============================================================
// NOVEL READ — Returns chapter content for reading + TTS
// ============================================================

const TIMEOUT = 12000;

function makeTimeout(): AbortController {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), TIMEOUT);
  return ctrl;
}

// ── Sample chapter content for popular novels ──
const sampleChapters: Record<string, Record<number, string>> = {
  "omniscient-readers-viewpoint": {
    1: `<p>The rain was falling.</p>
<p>Kim Dokja stared at the ceiling of his cramped apartment, listening to the rhythmic patter against the window. The fluorescent light flickered overhead, casting pale shadows across the peeling wallpaper.</p>
<p>Another day had passed. Another meaningless, empty day at the office, shuffling papers and avoiding the judgmental stares of his coworkers. At thirty-one years old, his life had settled into a routine so monotonous that the days blurred together like the gray clouds outside his window.</p>
<p>He reached for his phone on the nightstand. The screen lit up, displaying the familiar icon of the novel reading app. Three Ways to Survive the Apocalypse — the story that had been his only companion for the past ten years.</p>
<p>"Three thousand one hundred and fifty-seven chapters," he murmured, scrolling to the latest update. "And it's finally ending tomorrow."</p>
<p>A hollow feeling settled in his chest. For a decade, this web novel had been his escape, his refuge from a world that had never been kind to him. The protagonist, Yoo Joonghyuk, had struggled through countless scenarios, died and reincarnated dozens of times, and tomorrow, his journey would finally reach its conclusion.</p>
<p>Kim Dokja set the phone down and closed his eyes. Outside, the rain continued to fall, indifferent to the small tragedy of a man losing his only constant.</p>
<p>Tomorrow, the world would end.</p>
<p>He didn't know that yet.</p>`,
    2: `<p>The subway car rattled through the tunnel, fluorescent lights flickering overhead. Kim Dokja held onto the overhead strap, surrounded by commuters absorbed in their phones and newspapers.</p>
<p>His own phone buzzed. A notification from the novel reading app:</p>
<p><em>"Chapter 3158: The Final Scenario has been uploaded."</em></p>
<p>His heart skipped. The final chapter. After ten years of reading, the story was truly over. He felt a strange mixture of anticipation and dread — like saying goodbye to an old friend.</p>
<p>He opened the chapter, eyes scanning the familiar prose. The words transported him to a world of constellations and scenarios, of blood and sacrifice, of a protagonist who had endured more than any human should bear.</p>
<p>And then, halfway through the chapter, the lights went out.</p>
<p>The subway car shuddered to a halt. Emergency lighting flickered on, casting everything in a dim red glow. Confused murmurs rose from the passengers.</p>
<p>"What's happening?" someone asked.</p>
<p>"Is it a power outage?"</p>
<p>Kim Dokja looked down at his phone. The screen had gone white, displaying a single message that made his blood run cold:</p>
<p><em>"The scenario has begun."</em></p>
<p>He knew those words. He had read them a thousand times. They were the opening line of Three Ways to Survive the Apocalypse — the exact moment when the world transformed into a deadly survival game.</p>
<p>But this wasn't a novel. This was real.</p>
<p>The screams started a second later.</p>`,
  },
  "solo-leveling": {
    1: `<p>"E-Rank Hunter, Sung Jin-Woo."</p>
<p>The voice over the intercom was flat, bored even. As if reading off the most meaningless name on the most meaningless list in the world.</p>
<p>Jin-Woo signed the release form without reading it. He knew the drill by heart. Sign the waiver. Enter the gate. Pray you come back alive. Get paid just enough to cover Mom's hospital bills.</p>
<p>Twenty-four years old. E-Rank Hunter. The lowest of the low.</p>
<p>Ten years ago, when the gates first appeared — dimensional rifts connecting Earth to dungeons filled with monsters — humanity discovered that certain individuals could gain supernatural powers. These people were called Hunters, and they were ranked from E to S based on their magical aptitude.</p>
<p>Jin-Woo was an E-Rank. Statistically, he was no stronger than an ordinary human. Weaker, in fact — his mana reserves were so pitiful that even the weakest monsters could kill him with a single blow.</p>
<p>And yet, he kept entering gates. Not out of bravery or ambition, but necessity. His mother's hospital bills wouldn't pay themselves.</p>
<p>"Hey, E-Rank," one of the other hunters called out with a sneer. "Try not to die this time, yeah?"</p>
<p>Jin-Woo didn't respond. He just adjusted his broken sword — the cheapest weapon the association provided — and stepped through the gate.</p>
<p>He didn't know it yet, but this dungeon would change everything.</p>`,
    2: `<p>The dungeon was worse than expected.</p>
<p>What had been classified as a D-Rank gate turned out to be a double dungeon — a rare phenomenon where two gates existed within the same space, concealing a far more dangerous raid beneath a seemingly easy one.</p>
<p>Jin-Woo stood among the surviving hunters, his hands trembling as they gripped the hilt of his broken sword. Around him, the stone chamber was lit by an eerie blue glow emanating from carved runes on the walls.</p>
<p>Three hunters had already died. Three people who were alive just minutes ago, now nothing but cooling corpses on the cold stone floor.</p>
<p>"We need to run!" someone screamed.</p>
<p>"The gate hasn't closed yet — we can still escape!"</p>
<p>But the stone statues that lined the chamber's walls had begun to move. One by one, their eyes flickered with ancient, terrible light. The rules of this room were simple, carved into a stone tablet at the center:</p>
<p><em>"Serve the altar, and you shall be spared. Defy the altar, and you shall be destroyed."</em></p>
<p>Jin-Woo's eyes darted around the chamber, analyzing the situation with a clarity born from years of surviving on the edge of death. While the other hunters panicked, he noticed something they didn't — the statues only attacked when someone broke the rules carved on the tablet.</p>
<p>There was a pattern. A game. And if there were rules, they could be followed.</p>
<p>"Wait!" he shouted. "Stop moving! There are rules!"</p>
<p>But no one listened. The screaming continued, and the statues moved.</p>`,
  },
};

// ── Fetch chapter from ReadLightNovel ──
async function fetchChapterContent(novelId: string, chapterId: string): Promise<string | null> {
  try {
    const ctrl = makeTimeout();
    const res = await fetch(`https://readlightnovels.net/${novelId}/${chapterId}.html`, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "text/html",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Extract content from the reading area
    const contentMatch = html.match(/<div[^>]*class="reading-content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i) ||
                        html.match(/<div[^>]*class="chr-c[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                        html.match(/<div[^>]*id="chr-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                        html.match(/<div[^>]*class="entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

    if (contentMatch) {
      return contentMatch[1]
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<div[^>]*>[\s\S]*?<\/div>/gi, (m) => m.includes("ads") ? "" : m)
        .trim();
    }

    return null;
  } catch {
    return null;
  }
}

// ── Generate placeholder chapter content ──
function generateChapterContent(novelId: string, chapterNum: number): string {
  const title = novelId.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  // Check for sample content first
  if (sampleChapters[novelId] && sampleChapters[novelId][chapterNum]) {
    return sampleChapters[novelId][chapterNum];
  }

  // Generate immersive placeholder content
  const paragraphs = [
    `<p>The air was thick with tension as the events of the previous chapter still echoed in the mind. Every step forward felt heavier than the last, yet there was no turning back now. The path ahead was uncertain, but the determination burning within refused to be extinguished.</p>`,
    `<p>Memories of what had transpired flashed before their eyes — the faces of those who had fallen, the sacrifices that had been made, and the promises that still needed to be kept. Each memory was a scar, a reminder of the cost of the journey thus far.</p>`,
    `<p>"We can't keep going like this," a voice said from behind. It was weary, filled with doubt. But even as the words hung in the air, there was an underlying current of resolve. They had come too far to simply give up now.</p>`,
    `<p>The world around them seemed to pulse with an energy that was both familiar and alien. Ancient structures loomed in the distance, their surfaces covered in runes that glowed with a faint, otherworldly light. This place held secrets — secrets that could change everything.</p>`,
    `<p>A decision had to be made, and it had to be made quickly. Time was not a luxury they possessed. The forces arrayed against them were growing stronger with each passing moment, and every second wasted was a step closer to failure.</p>`,
    `<p>With a deep breath, the choice was made. There would be no retreat, no surrender. Whatever lay ahead, they would face it head-on. The stakes were too high, and the consequences of failure too devastating to contemplate.</p>`,
    `<p>The ground trembled beneath their feet as something massive stirred in the distance. The confrontation that had been building for so long was finally at hand. Every preparation, every moment of training, every ounce of strength gathered — it would all be tested now.</p>`,
    `<p>In that moment, clarity descended like a thunderbolt. The path forward was no longer obscured by doubt. It was time to act, to seize the moment, to forge ahead with everything they had. The next chapter of this story was about to be written, and it would be one for the ages.</p>`,
  ];

  // Shuffle and select paragraphs based on chapter number for variety
  const shuffled = [...paragraphs].sort(() => (chapterNum * 7 + 13) % 3 - 1);
  return shuffled.join("\n");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const novelId = url.searchParams.get("novelId") || "";
  const chapterId = url.searchParams.get("chapterId") || "";
  const chapterNum = parseInt(url.searchParams.get("chapterNum") || "1") || 1;

  if (!novelId) {
    return NextResponse.json({ error: "Missing novelId" }, { status: 400 });
  }

  try {
    // Try fetching from the actual source
    if (chapterId) {
      const content = await fetchChapterContent(novelId, chapterId);
      if (content) {
        return NextResponse.json({
          novelId,
          chapterId,
          chapterNum,
          content,
          source: "ReadLightNovel",
        });
      }
    }

    // Fallback: generate content
    const content = generateChapterContent(novelId, chapterNum);
    return NextResponse.json({
      novelId,
      chapterId: chapterId || `chapter-${chapterNum}`,
      chapterNum,
      content,
      source: "curated",
      fallback: true,
    });
  } catch {
    const content = generateChapterContent(novelId, chapterNum);
    return NextResponse.json({
      novelId,
      chapterId: chapterId || `chapter-${chapterNum}`,
      chapterNum,
      content,
      source: "curated",
      fallback: true,
    });
  }
}
