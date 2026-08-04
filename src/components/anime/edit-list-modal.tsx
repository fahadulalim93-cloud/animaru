"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "./store";
import { fetchAniListEntry, saveAniListEntry, deleteAniListEntry } from "@/lib/anilist-auth";

const STATUS_OPTIONS = [
  { value: "CURRENT", label: "Watching" },
  { value: "PLANNING", label: "Planning" },
  { value: "COMPLETED", label: "Completed" },
  { value: "PAUSED", label: "Paused" },
  { value: "DROPPED", label: "Dropped" },
  { value: "REPEATING", label: "Rewatching" },
];

// Shown from "+" buttons once the user already has AniList linked — an
// AniList-style edit-entry form (status/score/progress/dates/notes) that
// actually writes to their real AniList list via SaveMediaListEntry.
export default function EditListModal() {
  const target = useAppStore((s) => s.editListTarget);
  const close = useAppStore((s) => s.closeEditListModal);
  const anilistToken = useAppStore((s) => s.anilistToken);
  const anilistUser = useAppStore((s) => s.anilistUser);

  const [entryId, setEntryId] = useState<number | null>(null);
  const [status, setStatus] = useState("PLANNING");
  const [score, setScore] = useState(0);
  const [progress, setProgress] = useState(0);
  const [repeat, setRepeat] = useState(0);
  const [startedAt, setStartedAt] = useState("");
  const [completedAt, setCompletedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!target || !anilistToken || !anilistUser) return;
    setLoading(true);
    setError("");
    // Reset to blank defaults while the existing entry (if any) loads
    setEntryId(null);
    setStatus("PLANNING");
    setScore(0);
    setProgress(0);
    setRepeat(0);
    setStartedAt("");
    setCompletedAt("");
    setNotes("");
    fetchAniListEntry(anilistToken, target.id, anilistUser.id)
      .then((entry) => {
        if (!entry) return;
        setEntryId(entry.id);
        setStatus(entry.status);
        setScore(entry.score);
        setProgress(entry.progress);
        setRepeat(entry.repeat);
        setStartedAt(entry.startedAt);
        setCompletedAt(entry.completedAt);
        setNotes(entry.notes);
      })
      .catch(() => setError("Couldn't load this entry from AniList."))
      .finally(() => setLoading(false));
  }, [target, anilistToken, anilistUser]);

  useEffect(() => {
    if (!target) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", handler);
    };
  }, [target, close]);

  if (!target || !anilistToken) return null;

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      await saveAniListEntry(anilistToken, { mediaId: target.id, status, score, progress, repeat, notes, startedAt, completedAt });
      close();
    } catch {
      setError("Couldn't save to AniList. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!entryId) return;
    setSaving(true);
    setError("");
    try {
      await deleteAniListEntry(anilistToken, entryId);
      close();
    } catch {
      setError("Couldn't delete from AniList. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-[200] flex items-center justify-center p-4"
        style={{ background: "rgba(0, 0, 0, 0.85)" }}
        onClick={close}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 12 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-[640px] rounded-2xl overflow-hidden flex"
          style={{ background: "#000000", boxShadow: "0 20px 60px -15px rgba(0,0,0,0.9)" }}
        >
          {target.cover && (
            <div className="hidden sm:block w-[160px] shrink-0 self-stretch">
              <img src={target.cover} alt="" className="w-full h-full object-cover" />
            </div>
          )}

          <div className="flex-1 px-5 py-5 min-w-0">
            <div className="flex items-start justify-between mb-4 gap-3">
              <h2
                className="font-karla text-lg font-bold leading-snug bg-clip-text text-transparent"
                style={{ backgroundImage: "linear-gradient(180deg, #ffffff 0%, #a3a3a3 100%)" }}
              >
                {target.title}
              </h2>
              <button
                onClick={close}
                aria-label="Close"
                className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {loading ? (
              <div className="py-10 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-white/10 border-t-white rounded-full animate-spin" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="text-xs font-semibold text-white/50 mb-1 block">Status</label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-white/30"
                    >
                      {STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value} style={{ background: "#0a0a0a" }}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-white/50 mb-1 block">Score</label>
                    <input
                      type="number" min={0} max={10} step={0.5}
                      value={score}
                      onChange={(e) => setScore(Number(e.target.value))}
                      className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-white/30"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-white/50 mb-1 block">Progress</label>
                    <input
                      type="number" min={0}
                      value={progress}
                      onChange={(e) => setProgress(Number(e.target.value))}
                      className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-white/30"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="text-xs font-semibold text-white/50 mb-1 block">Start Date</label>
                    <input
                      type="date"
                      value={startedAt}
                      onChange={(e) => setStartedAt(e.target.value)}
                      className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-white/30"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-white/50 mb-1 block">Finish Date</label>
                    <input
                      type="date"
                      value={completedAt}
                      onChange={(e) => setCompletedAt(e.target.value)}
                      className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-white/30"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-white/50 mb-1 block">Rewatched Times</label>
                    <input
                      type="number" min={0}
                      value={repeat}
                      onChange={(e) => setRepeat(Number(e.target.value))}
                      className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-white/30"
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <label className="text-xs font-semibold text-white/50 mb-1 block">Notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Write your notes here..."
                    rows={2}
                    className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-white placeholder-white/30 resize-y focus:outline-none focus:border-white/30"
                  />
                </div>

                {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

                <div className="flex items-center justify-between">
                  {entryId ? (
                    <button
                      onClick={handleDelete}
                      disabled={saving}
                      className="px-4 py-2 rounded-lg text-sm font-semibold text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                    >
                      Delete
                    </button>
                  ) : <span />}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={close}
                      disabled={saving}
                      className="px-4 py-2 rounded-lg text-sm font-semibold text-white/70 bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="px-4 py-2 rounded-lg text-sm font-semibold text-black bg-white hover:bg-white/90 transition-colors disabled:opacity-50"
                    >
                      {saving ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
