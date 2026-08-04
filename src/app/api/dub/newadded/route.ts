import { NextResponse } from "next/server";
import { getDubNewAdded } from "@/lib/dub-api";

export async function GET() {
  try {
    const results = await getDubNewAdded();
    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
