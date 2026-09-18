import { redirect } from "next/navigation";
import { W2GRoomClient } from "@/components/w2g/w2g-room";

export const dynamic = "force-dynamic";

export default async function W2GRoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const roomCode = code.toUpperCase();
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/w2g/rooms/${roomCode}`, { cache: "no-store" });
    if (!res.ok) redirect("/w2g?error=room_not_found");
    const data = await res.json();
    const room = data.room;
    return (
      <main className="min-h-screen bg-background text-foreground">
        <W2GRoomClient roomCode={roomCode} animeId={room.animeId} episodeNum={room.episodeNum} animeTitle={room.animeTitle} animeImage={room.animeImage} />
      </main>
    );
  } catch { redirect("/w2g?error=room_not_found"); }
}
