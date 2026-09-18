import { headers } from "next/headers";
import { CreateRoomForm, JoinByCodeForm, PublicRoomsList } from "@/components/w2g/w2g-lobby";

export const dynamic = "force-dynamic";

export default async function W2GLobbyPage() {
  const h = await headers();
  const cookie = h.get("cookie") || "";
  const hasSession = cookie.includes("luffytv_user_session");

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-4 py-8 sm:py-12">
        <header className="mb-8 sm:mb-12">
          <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground mb-3">
            <a href="/" className="hover:text-foreground transition-colors">Home</a>
            <span>/</span>
            <span className="text-foreground">Lobbies</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight">
            Watch <span className="text-amber-400">Together</span>
          </h1>
          <p className="mt-2 text-sm sm:text-base text-muted-foreground max-w-2xl">
            Watch anime with friends in real time. Synced playback, voice chat, and live text chat.
          </p>
        </header>

        <section className="grid sm:grid-cols-2 gap-4 mb-10">
          <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            <h2 className="text-lg sm:text-xl font-bold mb-1">Create a Room</h2>
            <p className="text-xs sm:text-sm text-muted-foreground mb-4">Start a new watch party. You become the host.</p>
            {hasSession ? <CreateRoomForm /> : (
              <div className="space-y-3">
                <p className="text-sm text-amber-400 font-medium">Please log in to make a Watch Together room.</p>
                <a href="/login?next=/w2g" className="inline-flex items-center justify-center h-10 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm transition-colors">Log In</a>
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            <h2 className="text-lg sm:text-xl font-bold mb-1">Join by Code</h2>
            <p className="text-xs sm:text-sm text-muted-foreground mb-4">Have a 6-character room code? Enter it below.</p>
            <JoinByCodeForm isLoggedIn={hasSession} />
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg sm:text-xl font-bold">Public Rooms</h2>
            <span className="text-xs text-muted-foreground">Live now</span>
          </div>
          <PublicRoomsList isLoggedIn={hasSession} />
        </section>
      </div>
    </main>
  );
}
