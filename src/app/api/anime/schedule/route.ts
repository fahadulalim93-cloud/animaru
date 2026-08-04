import { NextResponse } from "next/server";
import { getSchedule } from "@/lib/anime-api";

export async function GET() {
  try {
    const data = await getSchedule();
    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch schedule";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
