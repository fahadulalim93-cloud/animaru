"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAppStore } from "./store";
import { listUsersSafe } from "@/lib/auth-local";
import { frameSrcOf } from "./avatar-frames";
import { trackXPForUser } from "@/lib/xp-tracker";

/**
 * AnimeComments — reusable comment section
 *
 * Used on:
 *   - anime-detail.tsx (Comments tab)
 *   - watch-page.tsx (bottom of watch page)
 *
 * Storage strategy:
 *   1. PRIMARY: localStorage (per-browser, works on Vercel where SQLite is read-only)
 *   2. OPTIONAL: tries to sync with /api/comments server endpoint
 *      - If server returns real data (DB available), merges it in
 *      - If server returns empty/fake data (DB unavailable), uses localStorage only
 *
 * Comments are keyed by animeId so each anime has its own thread. When an
 * episode number is provided, a second "EP N" tab filters to that episode.
 */

const ACCENT = "#E63946";
const STORAGE_KEY = "luffytv_comments";

type LocalComment = {
  id: string;
  animeId: string;
  animeTitle?: string;
  episode?: number | null;
  username: string;
  content: string;
  rating?: number | null;
  likes: number;
  dislikes?: number;
  parentId?: string | null;
  createdAt: string;
};

function loadAllLocal(): Record<string, LocalComment[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function saveAllLocal(all: Record<string, LocalComment[]>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {}
}

function loadLocalComments(animeId: string): LocalComment[] {
  return loadAllLocal()[animeId] || [];
}

function saveLocalComment(c: LocalComment) {
  const all = loadAllLocal();
  if (!all[c.animeId]) all[c.animeId] = [];
  all[c.animeId].unshift(c);
  saveAllLocal(all);
}

// Per-browser record of which comments this visitor already voted on, so
// clicking a vote button twice doesn't double-count (localStorage has no
// real per-user identity to enforce this server-side).
const VOTED_KEY = "luffytv_comment_votes";
function getVote(commentId: string): "like" | "dislike" | null {
  if (typeof window === "undefined") return null;
  try {
    const all = JSON.parse(localStorage.getItem(VOTED_KEY) || "{}");
    return all[commentId] || null;
  } catch { return null; }
}
function setVoteLocal(commentId: string, vote: "like" | "dislike" | null) {
  if (typeof window === "undefined") return;
  try {
    const all = JSON.parse(localStorage.getItem(VOTED_KEY) || "{}");
    if (vote) all[commentId] = vote; else delete all[commentId];
    localStorage.setItem(VOTED_KEY, JSON.stringify(all));
  } catch {}
}

function updateLocalCommentVotes(animeId: string, commentId: string, likesDelta: number, dislikesDelta: number) {
  const all = loadAllLocal();
  const list = all[animeId] || [];
  const c = list.find((x) => x.id === commentId);
  if (!c) return;
  c.likes = Math.max(0, (c.likes || 0) + likesDelta);
  c.dislikes = Math.max(0, (c.dislikes || 0) + dislikesDelta);
  saveAllLocal(all);
}

// Removes a comment (and any replies to it) from this browser's local copy.
function deleteLocalComment(animeId: string, commentId: string) {
  const all = loadAllLocal();
  const list = all[animeId] || [];
  all[animeId] = list.filter((c) => c.id !== commentId && c.parentId !== commentId);
  saveAllLocal(all);
}

// Minimal, safe markdown → HTML for the composer's Preview toggle. Escapes
// HTML first, then only recognizes **bold**, *italic*, ![alt](img) and
// [text](link) — enough for the comment toolbar, nothing that needs a
// full markdown library.
function renderMarkdownPreview(src: string): string {
  const esc = src
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return esc
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1" class="max-w-full rounded-lg my-1" />')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer nofollow ugc" class="text-blue-400 underline">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br />");
}

export default function AnimeComments({
  animeId,
  animeTitle,
  episode,
}: {
  animeId: string;
  animeTitle: string;
  episode?: number | null;
}) {
  const user = useAppStore((s) => s.user);
  const openAuthModal = useAppStore((s) => s.openAuthModal);
  const [comments, setComments] = useState<LocalComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [attachedGif, setAttachedGif] = useState<string | null>(null);
  const [rating] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const hasEpisode = episode != null && episode > 0;
  const [scope, setScope] = useState<"anime" | "episode">(hasEpisode ? "episode" : "anime");
  const [sortBy, setSortBy] = useState<"top" | "newest">("top");

  const fetchComments = useCallback(async () => {
    setLoading(true);
    // 1. Load local comments immediately (instant)
    const local = loadLocalComments(animeId);

    // 2. Try server API in parallel (may have shared comments if DB is configured)
    let serverComments: LocalComment[] = [];
    try {
      const res = await fetch(`/api/comments?animeId=${encodeURIComponent(animeId)}`);
      if (res.ok) {
        const data = await res.json();
        serverComments = (data.comments || []).filter(
          (c: any) => c && c.id && c.id !== "0" // filter out safe-proxy fake responses
        );
      }
    } catch {}

    // 3. Merge: server comments + local comments, dedupe by id
    const merged: LocalComment[] = [];
    const seen = new Set<string>();
    for (const c of serverComments) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        merged.push(c);
      }
    }
    for (const c of local) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        merged.push(c);
      }
    }
    merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    setComments(merged);
    setLoading(false);
  }, [animeId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  useEffect(() => {
    setScope(hasEpisode ? "episode" : "anime");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animeId, episode]);

  const scoped = useMemo(() => {
    const filtered = scope === "episode"
      ? comments.filter((c) => c.episode === episode)
      : comments;
    const sorted = [...filtered];
    if (sortBy === "top") sorted.sort((a, b) => (b.likes || 0) - (a.likes || 0));
    else sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return sorted;
  }, [comments, scope, episode, sortBy]);

  // Looks up each commenter's live profile (avatar photo + equipped frame).
  // Comments store the poster's *display name* as "username" (see
  // handleSubmit: `username: user.name || user.username`), so this has to
  // match on either the account's name or its login handle. Only works for
  // accounts registered on this browser (the local-storage auth system has
  // no cross-device identity) — comments from other browsers still fall
  // back to the plain letter avatar.
  const usersByUsername = useMemo(() => {
    const map = new Map<string, ReturnType<typeof listUsersSafe>[number]>();
    for (const u of listUsersSafe()) {
      map.set(u.name, u);
      map.set(u.username, u);
    }
    return map;
  }, [comments]);

  // Groups replies (parentId set) under their top-level comment — one level
  // deep, matching how the thread is displayed. Replies stay oldest-first
  // regardless of the top-level Sort By setting.
  const threaded = useMemo(() => {
    const top = scoped.filter((c) => !c.parentId);
    return top.map((c) => ({
      ...c,
      replies: scoped
        .filter((r) => r.parentId === c.id)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    }));
  }, [scoped]);

  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const [, forceVoteRerender] = useState(0);

  const handleDelete = (commentId: string) => {
    deleteLocalComment(animeId, commentId);
    setComments((prev) => prev.filter((c) => c.id !== commentId && c.parentId !== commentId));
    setMenuOpenFor(null);
  };

  const handleVote = (comment: LocalComment, vote: "like" | "dislike") => {
    if (!user) { openAuthModal("signin"); return; }
    const current = getVote(comment.id);
    let likesDelta = 0, dislikesDelta = 0;
    if (current === vote) {
      // toggling the same vote off
      if (vote === "like") likesDelta = -1; else dislikesDelta = -1;
      setVoteLocal(comment.id, null);
    } else {
      if (vote === "like") { likesDelta = 1; if (current === "dislike") dislikesDelta = -1; }
      else { dislikesDelta = 1; if (current === "like") likesDelta = -1; }
      setVoteLocal(comment.id, vote);
    }
    updateLocalCommentVotes(animeId, comment.id, likesDelta, dislikesDelta);
    setComments((prev) => prev.map((c) => c.id === comment.id
      ? { ...c, likes: Math.max(0, (c.likes || 0) + likesDelta), dislikes: Math.max(0, (c.dislikes || 0) + dislikesDelta) }
      : c));
    forceVoteRerender((n) => n + 1);
  };

  const handleReplySubmit = async (parent: LocalComment) => {
    if (!user || !replyContent.trim()) return;
    setReplySubmitting(true);
    const commentUsername = user.name || user.username;
    const newReply: LocalComment = {
      id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      animeId,
      animeTitle: animeTitle || undefined,
      episode: parent.episode ?? null,
      username: commentUsername,
      content: replyContent.trim(),
      rating: null,
      likes: 0,
      dislikes: 0,
      parentId: parent.id,
      createdAt: new Date().toISOString(),
    };
    saveLocalComment(newReply);
    try {
      await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ animeId, episode: newReply.episode, username: commentUsername, content: newReply.content, parentId: parent.id }),
      });
    } catch {}
    // Award XP for replying (2 XP per reply)
    trackXPForUser(user, 2, "comment_reply");
    setReplyContent("");
    setReplySubmitting(false);
    setReplyingTo(null);
    fetchComments();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalContent = [content.trim(), attachedGif ? `![gif](${attachedGif})` : ""].filter(Boolean).join("\n");
    if (!user || !finalContent) return;
    setSubmitting(true);

    const commentUsername = user.name || user.username;
    const newComment: LocalComment = {
      id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      animeId,
      animeTitle: animeTitle || undefined,
      episode: scope === "episode" && hasEpisode ? Number(episode) : null,
      username: commentUsername,
      content: finalContent,
      rating: rating > 0 ? rating : null,
      likes: 0,
      createdAt: new Date().toISOString(),
    };

    saveLocalComment(newComment);

    try {
      await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          animeId,
          episode: newComment.episode,
          username: commentUsername,
          content: finalContent,
          rating: rating > 0 ? rating : null,
        }),
      });
    } catch {}

    // Award XP for commenting (5 XP per comment)
    trackXPForUser(user, 5, "comment_posted");

    setContent("");
    setAttachedGif(null);
    setSubmitting(false);
    setFormOpen(false);
    setPreview(false);
    fetchComments();
  };

  // ── Toolbar: wraps the current selection with markdown syntax ──
  const wrapSelection = (before: string, after: string = before, placeholder = "") => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = content.slice(start, end) || placeholder;
    const next = content.slice(0, start) + before + selected + after + content.slice(end);
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + before.length + selected.length;
      el.setSelectionRange(cursor, cursor);
    });
  };

  // ── Toolbar: inserts text at the cursor (replacing any selection) ──
  const insertAtCursor = (text: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = content.slice(0, start) + text + content.slice(end);
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + text.length;
      el.setSelectionRange(cursor, cursor);
    });
  };

  const insertLink = () => {
    const url = window.prompt("Link URL:");
    if (!url) return;
    wrapSelection("[", `](${url})`, "link text");
  };

  const insertImage = () => {
    const url = window.prompt("Image URL:");
    if (!url) return;
    wrapSelection("![", `](${url})`, "alt text");
  };

  // ── GIF picker (KLIPY) ──
  const [gifPickerOpen, setGifPickerOpen] = useState(false);
  const [gifQuery, setGifQuery] = useState("");
  const [gifResults, setGifResults] = useState<{ id: string; url: string; preview: string; title: string }[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [gifError, setGifError] = useState("");
  const gifPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!gifPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (gifPickerRef.current && !gifPickerRef.current.contains(e.target as Node)) setGifPickerOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [gifPickerOpen]);

  const fetchGifs = useCallback(async (q: string) => {
    setGifLoading(true);
    setGifError("");
    try {
      const res = await fetch(`/api/gif/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) { setGifError(data.error || "Couldn't load GIFs."); setGifResults([]); }
      else setGifResults(data.results || []);
    } catch {
      setGifError("Couldn't load GIFs.");
      setGifResults([]);
    } finally {
      setGifLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!gifPickerOpen || !gifQuery.trim()) { setGifResults([]); return; }
    const t = setTimeout(() => fetchGifs(gifQuery), 350);
    return () => clearTimeout(t);
  }, [gifPickerOpen, gifQuery, fetchGifs]);

  const selectGif = (url: string) => {
    setAttachedGif(url);
    setGifPickerOpen(false);
    setGifQuery("");
  };

  const formatTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  };

  const renderCommentRow = (c: LocalComment & { replies?: LocalComment[] }, isReply: boolean) => {
    const vote = getVote(c.id);
    const isOwn = !!user && (user.name === c.username || user.username === c.username);
    const author = usersByUsername.get(c.username);
    const frame = frameSrcOf(author?.avatarFrame);
    return (
      <div key={c.id} className={isReply ? "ml-5 mt-3 pl-4 border-l border-white/10" : ""}>
        <div className="flex items-center gap-2.5 mb-1.5">
          <div className="relative w-9 h-9 shrink-0">
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[78%] h-[78%] rounded-full flex items-center justify-center overflow-hidden transition-shadow z-[1]"
              style={{ backgroundColor: (author?.avatarColor || "#7c3aed") + "44" }}
            >
              {author?.avatarImage ? (
                <img src={author.avatarImage} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
              ) : (
                <span className="text-xs font-bold" style={{ color: author?.avatarColor || undefined }}>{(author?.avatar || c.username || "A")[0].toUpperCase()}</span>
              )}
            </div>
            {frame ? (
              <img src={frame} alt="" loading="lazy" decoding="async" className="pointer-events-none absolute inset-0 w-full h-full max-w-none select-none z-[2]" />
            ) : (
              <div className="absolute inset-0 rounded-full border border-white/10 z-[1] pointer-events-none" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-sm font-bold text-white truncate">{c.username || "Anonymous"}</p>
              <span className="text-xs text-white/30">&middot; {formatTime(c.createdAt)}</span>
            </div>
          </div>
          {c?.rating != null && c.rating > 0 && (
            <div className="flex items-center gap-0.5 shrink-0">
              {Array.from({ length: 5 }).map((_, i) => (
                <svg key={i} className={`w-3 h-3 ${i < (c?.rating || 0) ? "text-yellow-400" : "text-white/10"}`} fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
            </div>
          )}
        </div>

        <div
          className="text-sm text-white/70 leading-relaxed break-words [&_img]:max-w-[220px]"
          dangerouslySetInnerHTML={{ __html: renderMarkdownPreview(c.content) }}
        />

        <div className="flex items-center gap-3 mt-2 text-white/40">
          <button
            onClick={() => handleVote(c, "like")}
            className={`flex items-center gap-1 text-xs transition-colors ${vote === "like" ? "text-white" : "hover:text-white"}`}
          >
            <svg className="w-3.5 h-3.5" fill={vote === "like" ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3" /></svg>
            {c.likes || 0}
          </button>
          <button
            onClick={() => handleVote(c, "dislike")}
            className={`transition-colors ${vote === "dislike" ? "text-white" : "hover:text-white"}`}
          >
            <svg className="w-3.5 h-3.5 scale-x-[-1] scale-y-[-1]" fill={vote === "dislike" ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3" /></svg>
          </button>
          {!isReply && (
            <button
              onClick={() => { if (!user) { openAuthModal("signin"); return; } setReplyingTo(replyingTo === c.id ? null : c.id); setReplyContent(""); }}
              className="flex items-center gap-1 text-xs font-semibold hover:text-white transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 17L4 12l5-5M4 12h11a4 4 0 014 4v1" /></svg>
              Reply
            </button>
          )}
          <div className="relative ml-auto">
            <button onClick={() => setMenuOpenFor(menuOpenFor === c.id ? null : c.id)} className="w-6 h-6 rounded flex items-center justify-center hover:bg-white/[0.06] hover:text-white transition-colors">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
            </button>
            {menuOpenFor === c.id && (
              <div className="absolute right-0 top-full mt-1 w-32 py-1 rounded-lg border border-white/10 bg-[#0a0a0a] shadow-xl z-30">
                {isOwn && (
                  <button onClick={() => handleDelete(c.id)} className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-white/[0.06] transition-colors">Delete</button>
                )}
                <button onClick={() => setMenuOpenFor(null)} className="w-full text-left px-3 py-1.5 text-xs text-white/60 hover:bg-white/[0.06] transition-colors">Report</button>
              </div>
            )}
          </div>
        </div>

        {!isReply && replyingTo === c.id && (
          <div className="flex items-center gap-2 mt-3">
            <input
              autoFocus
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleReplySubmit(c); } }}
              placeholder={`Reply to ${c.username}...`}
              className="flex-1 px-3 py-1.5 rounded-full bg-black/40 border border-white/10 text-sm text-white placeholder-white/30 outline-none focus:border-white/25"
            />
            <button
              onClick={() => handleReplySubmit(c)}
              disabled={replySubmitting || !replyContent.trim()}
              className="px-3.5 py-1.5 rounded-full bg-white text-black text-xs font-bold hover:bg-white/90 transition-colors disabled:opacity-30"
            >
              Reply
            </button>
          </div>
        )}

        {!isReply && c.replies && c.replies.length > 0 && c.replies.map((r) => renderCommentRow(r, true))}
      </div>
    );
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] fade-in">
      {/* ── Header — title left, Anime/Episode scope tabs right ── */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4 flex-wrap gap-3">
        <div>
          <p className="text-sm text-white/50">The Anime Community</p>
          <h2 className="font-karla text-2xl font-extrabold text-white">Comments</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setScope("anime")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide transition-colors ${
              scope === "anime" ? "text-white" : "bg-white/[0.06] text-white/50 hover:text-white"
            }`}
            style={scope === "anime" ? { backgroundColor: "#000000", border: `1px solid ${ACCENT}` } : undefined}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
            Anime
          </button>
          {hasEpisode && (
            <button
              onClick={() => setScope("episode")}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide transition-colors text-white"
              style={{ backgroundColor: scope === "episode" ? ACCENT : "rgba(255,255,255,0.06)" }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
              EP {episode}
            </button>
          )}
        </div>
      </div>

      {/* ── Rules/FAQ + auth state row ── */}
      <div className="flex items-center justify-between px-5 pb-4 flex-wrap gap-3">
        <div className="flex items-center gap-4 text-sm text-white/50">
          <span className="cursor-default hover:text-white transition-colors">Rules</span>
          <span className="cursor-default hover:text-white transition-colors">FAQ</span>
        </div>
        {user ? (
          <div className="flex items-center gap-3">
            <button className="text-white/50 hover:text-white transition-colors" title="Notifications">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
            </button>
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border border-white/15 shrink-0 overflow-hidden"
              style={{ backgroundColor: (user.avatarColor || ACCENT) + "44", color: user.avatarColor || ACCENT }}
            >
              {user.avatarImage ? <img src={user.avatarImage} alt="" className="w-full h-full object-cover" /> : (user.avatar || user.username.charAt(0) || "?").toUpperCase()}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button className="w-7 h-7 rounded-full flex items-center justify-center text-white/40 hover:text-white transition-colors" title="Help">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M9.09 9a3 3 0 015.83 1c0 2-3 2-3 4" /><line x1="12" y1="17" x2="12.01" y2="17" strokeLinecap="round" /></svg>
            </button>
            <button
              onClick={() => openAuthModal("signin")}
              className="px-4 py-1.5 rounded-lg bg-white text-black text-sm font-bold hover:bg-white/90 transition-colors"
            >
              Log In
            </button>
            <button
              onClick={() => openAuthModal("signup")}
              className="px-4 py-1.5 rounded-lg bg-white/[0.06] border border-white/10 text-white text-sm font-bold hover:bg-white/[0.1] transition-colors"
            >
              Sign Up
            </button>
          </div>
        )}
      </div>

      <div className="h-px bg-white/10" />

      {/* ── Count + sort row ── */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <p className="text-sm text-white/50">{scoped.length} Comments</p>
        <div className="flex items-center gap-2 text-sm text-white/50">
          <span>Sort By:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "top" | "newest")}
            className="bg-white/[0.06] border border-white/10 rounded-lg px-2.5 py-1 text-sm text-white focus:outline-none"
          >
            <option value="top" style={{ background: "#0a0a0a" }}>Top</option>
            <option value="newest" style={{ background: "#0a0a0a" }}>Newest</option>
          </select>
        </div>
      </div>

      {/* ── Add a comment ── */}
      <div className="px-5 pb-4">
        {user ? (
          formOpen ? (
            <form
              onSubmit={handleSubmit}
              onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") e.currentTarget.requestSubmit(); }}
              className="rounded-lg border border-white/10 bg-black/40"
            >
              {/* Toolbar */}
              <div className="relative flex items-center justify-between px-3 py-2 border-b border-white/10">
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => wrapSelection("**", "**", "bold text")} title="Bold" className="w-7 h-7 rounded flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors font-bold text-sm">B</button>
                  <button type="button" onClick={() => wrapSelection("*", "*", "italic text")} title="Italic" className="w-7 h-7 rounded flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors italic text-sm">I</button>
                  <button type="button" onClick={insertLink} title="Link" className="w-7 h-7 rounded flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" /><path strokeLinecap="round" strokeLinejoin="round" d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></svg>
                  </button>
                  <button type="button" onClick={insertImage} title="Image" className="w-7 h-7 rounded flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path strokeLinecap="round" strokeLinejoin="round" d="M21 15l-5-5L5 21" /></svg>
                  </button>
                  <button type="button" onClick={() => setGifPickerOpen((o) => !o)} title="GIF" className={`px-1.5 h-7 rounded flex items-center justify-center transition-colors text-[10px] font-bold ${gifPickerOpen ? "text-white bg-white/[0.08]" : "text-white/60 hover:text-white hover:bg-white/[0.06]"}`}>GIF</button>
                  <button type="button" onClick={() => insertAtCursor("@")} title="Mention" className="w-7 h-7 rounded flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors">@</button>
                  <button type="button" title="Markdown: **bold**, *italic*, [text](url), ![alt](url)" className="w-7 h-7 rounded flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M9.09 9a3 3 0 015.83 1c0 2-3 2-3 4" /><line x1="12" y1="17" x2="12.01" y2="17" strokeLinecap="round" /></svg>
                  </button>

                  {gifPickerOpen && (
                    <div ref={gifPickerRef} className="absolute left-0 top-full mt-1 w-80 max-h-96 overflow-hidden flex flex-col rounded-lg border border-white/10 bg-[#0a0a0a] shadow-2xl z-50">
                      <div className="p-2 border-b border-white/10">
                        <input
                          autoFocus
                          value={gifQuery}
                          onChange={(e) => setGifQuery(e.target.value)}
                          placeholder="Search KLIPY"
                          className="w-full px-2.5 py-1.5 rounded bg-white/[0.06] border border-white/10 text-xs text-white placeholder-white/30 outline-none focus:border-white/25"
                        />
                      </div>
                      <div className="flex-1 overflow-y-auto p-2 grid grid-cols-3 gap-1">
                        {!gifQuery.trim() ? (
                          <div className="col-span-3 text-center py-10 text-xs text-white/30">Search for a GIF to see results.</div>
                        ) : gifLoading ? (
                          <div className="col-span-3 text-center py-8 text-xs text-white/30">Loading...</div>
                        ) : gifError ? (
                          <div className="col-span-3 text-center py-8 text-xs text-white/30 px-3">{gifError}</div>
                        ) : gifResults.length === 0 ? (
                          <div className="col-span-3 text-center py-8 text-xs text-white/30">No GIFs found</div>
                        ) : (
                          gifResults.map((g) => (
                            <button
                              key={g.id}
                              type="button"
                              onClick={() => selectGif(g.url)}
                              className="block w-full h-20 rounded overflow-hidden bg-white/5 hover:ring-2 ring-white/30 transition-all"
                              title={g.title}
                            >
                              <img src={g.preview} alt={g.title} className="block w-full h-full object-cover" loading="lazy" />
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setPreview((p) => !p)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-colors ${preview ? "text-white bg-white/[0.08]" : "text-white/50 hover:text-white"}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                  Preview
                </button>
              </div>

              {/* Editor / Preview */}
              {preview ? (
                <div
                  className="w-full min-h-[76px] px-3.5 py-2.5 text-sm text-white/80 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: content.trim() ? renderMarkdownPreview(content) : '<span class="text-white/30">Nothing to preview yet.</span>' }}
                />
              ) : (
                <textarea
                  ref={textareaRef}
                  autoFocus
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Write a comment..."
                  className="w-full px-3.5 py-2.5 bg-transparent text-sm text-white placeholder-white/30 outline-none resize-none"
                  rows={3}
                  maxLength={500}
                />
              )}

              {/* Attached GIF preview */}
              {attachedGif && (
                <div className="relative inline-block m-3 mt-0">
                  <img src={attachedGif} alt="Attached GIF" className="h-28 rounded-lg border border-white/10" />
                  <button
                    type="button"
                    onClick={() => setAttachedGif(null)}
                    title="Remove"
                    className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-black border border-white/20 flex items-center justify-center text-white/70 hover:text-white transition-colors"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between px-3.5 py-2 border-t border-white/10">
                <p className="text-xs text-white/30">Markdown supported &middot; Ctrl+Enter to submit</p>
                <button
                  type="submit"
                  disabled={submitting || (!content.trim() && !attachedGif)}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-white text-black text-xs font-bold hover:bg-white/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2z" /></svg>
                  {submitting ? "Posting..." : "Post"}
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setFormOpen(true)}
              className="w-full text-left px-4 py-2.5 rounded-full bg-transparent border border-white/15 text-sm text-white/50 hover:border-white/30 transition-colors"
            >
              Add a comment
            </button>
          )
        ) : (
          <button onClick={() => openAuthModal("signin")} className="text-sm text-white/50 hover:text-white transition-colors">
            Log in to comment
          </button>
        )}
      </div>

      {/* ── Comments list ── */}
      <div className="px-5 pb-5">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="p-3 animate-pulse">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-full bg-white/5" />
                  <div className="h-3 w-24 bg-white/5 rounded" />
                </div>
                <div className="h-3 w-full bg-white/5 rounded mb-1" />
                <div className="h-3 w-2/3 bg-white/5 rounded" />
              </div>
            ))}
          </div>
        ) : threaded.length === 0 ? (
          <div className="text-center py-10 text-white/30 text-sm">No comments yet. Be the first to share your thoughts!</div>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {threaded.map((c) => (
              <div key={c.id} className="py-4 first:pt-0">
                {renderCommentRow(c, false)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
