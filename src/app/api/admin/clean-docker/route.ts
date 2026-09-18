import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/admin/clean-docker
 *
 * Cleans up Docker disk space on the VPS.
 * Requires a secret token to prevent unauthorized access.
 *
 * Runs:
 *   - docker container prune -f
 *   - docker image prune -a -f --filter 'until=24h'
 *   - docker volume prune -f
 *   - docker builder prune -a -f
 */
export async function POST(req: NextRequest) {
  // Simple auth: check for admin token
  const authHeader = req.headers.get("authorization");
  const expectedToken = process.env.ADMIN_CLEAN_TOKEN || "luffytv-clean-2026";
  if (authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Array<{ cmd: string; output: string; error?: string }> = [];

  const commands = [
    "df -h / | tail -1",
    "docker system df",
    "docker container prune -f",
    "docker image prune -a -f --filter 'until=24h'",
    "docker volume prune -f",
    "docker builder prune -a -f",
    "docker system df",
    "df -h / | tail -1",
  ];

  for (const cmd of commands) {
    try {
      const output = execSync(cmd, { timeout: 30000, encoding: "utf-8" }).trim();
      results.push({ cmd, output });
    } catch (e: any) {
      results.push({ cmd, output: "", error: e.message });
    }
  }

  return NextResponse.json({ results });
}

// GET handler for easy testing (returns Docker disk usage only, no cleanup)
export async function GET() {
  try {
    const df = execSync("df -h / | tail -1", { timeout: 5000, encoding: "utf-8" }).trim();
    const dockerDf = execSync("docker system df", { timeout: 10000, encoding: "utf-8" }).trim();
    return NextResponse.json({ disk: df, docker: dockerDf });
  } catch (e: any) {
    return NextResponse.json({ error: e.message });
  }
}
