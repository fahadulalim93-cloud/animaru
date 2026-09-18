"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ============================================================
// Subtitle Settings — type + defaults + localStorage persistence
// ============================================================

export interface SubtitleSettings {
  fontSize: number;        // px, default 24
  horizontalPos: number;   // 0-100 (%), default 50 (center)
  verticalPos: number;     // 0-100 (%), default 88 (near bottom)
  bgOpacity: number;       // 0-100 (%), default 55
  syncDelay: number;       // seconds, default 0 (can be negative)
  fontFamily: string;      // "Inter" | "Arial" | "Verdana" | "Trebuchet MS" | "Georgia" | "Mono"
  defaultSubtitleLang: string;  // ISO 639-1 code, default "en" — auto-select this language
}

const DEFAULTS: SubtitleSettings = {
  fontSize: 20,        // default — smaller so it fits mobile screens
  horizontalPos: 50,
  verticalPos: 82,     // was 89 — lowered so subs sit ABOVE the control bar, not overlapping it
  bgOpacity: 0,
  syncDelay: -0.3,     // default -300ms offset — Inazuma/Hancock subs arrive ~0.3s early
  fontFamily: "Inter",
  defaultSubtitleLang: "en",  // English by default — fixes the "Arabic/Chinese auto-selected" bug
};

const STORAGE_KEY = "luffytv_subtitle_settings_v6";  // bumped v5→v6 for smaller default font

export const FONT_OPTIONS = [
  { label: "Inter", value: "Inter, sans-serif" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Verdana", value: "Verdana, sans-serif" },
  { label: "Trebuchet", value: "'Trebuchet MS', sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Mono", value: "'Courier New', monospace" },
  { label: "Poppins", value: "Poppins, sans-serif" },
  { label: "Montserrat", value: "Montserrat, sans-serif" },
  { label: "Oswald", value: "Oswald, sans-serif" },
  { label: "Bebas", value: "'Bebas Neue', sans-serif" },
  { label: "Roboto", value: "Roboto, sans-serif" },
  { label: "Comic", value: "'Comic Sans MS', cursive" },
];

/**
 * Available default subtitle languages.
 * The `code` is an ISO 639-1 (2-letter) or ISO 639-3 (3-letter) language code,
 * matched against either:
 *   - The `lang` field of external subtitleTracks objects
 *   - The `language` field of HLS-embedded subtitle tracks (hls.js)
 *   - The `srclang` attribute of <track> elements
 *   - The textTrack.language property of native TextTrack objects
 *
 * We include a list of aliases so that "English" matches both "en" and "eng",
 * "Japanese" matches "ja" and "jpn", etc.
 */
export const SUBTITLE_LANGUAGES = [
  { label: "Off",         code: "off", aliases: [] },
  { label: "English",     code: "en",  aliases: ["eng", "en-US", "en-us"] },
  { label: "Japanese",    code: "ja",  aliases: ["jpn", "ja-JP"] },
  { label: "Spanish",    code: "es",  aliases: ["spa", "es-ES"] },
  { label: "French",     code: "fr",  aliases: ["fra", "fre", "fr-FR"] },
  { label: "German",     code: "de",  aliases: ["deu", "ger", "de-DE"] },
  { label: "Italian",    code: "it",  aliases: ["ita", "it-IT"] },
  { label: "Portuguese", code: "pt",  aliases: ["por", "pt-BR", "pt-PT"] },
  { label: "Russian",    code: "ru",  aliases: ["rus", "ru-RU"] },
  { label: "Arabic",     code: "ar",  aliases: ["ara", "ar-SA"] },
  { label: "Hindi",      code: "hi",  aliases: ["hin", "hi-IN"] },
  { label: "Tamil",      code: "ta",  aliases: ["tam"] },
  { label: "Telugu",     code: "te",  aliases: ["tel"] },
  { label: "Malayalam",  code: "ml",  aliases: ["mal"] },
  { label: "Bengali",    code: "bn",  aliases: ["ben", "bn-IN"] },
  { label: "Korean",     code: "ko",  aliases: ["kor", "ko-KR"] },
  { label: "Chinese",    code: "zh",  aliases: ["zho", "chi", "zh-CN", "zh-TW", "zh-Hans", "zh-Hant"] },
];

/**
 * Check whether a track language matches the user's preferred language.
 * Tries exact code match, then alias match, then case-insensitive
 * startsWith match (so "en" matches "en-US", "eng", etc.).
 *
 * Used by hls-player-new.tsx when auto-selecting the default subtitle track.
 */
export function subtitleLangMatches(trackLang: string | undefined, preferredCode: string): boolean {
  if (!trackLang) return false;
  if (preferredCode === "off") return false;

  const tl = trackLang.toLowerCase().trim();
  const pc = preferredCode.toLowerCase().trim();

  // Exact match
  if (tl === pc) return true;

  // Find the preferred language entry + its aliases
  const entry = SUBTITLE_LANGUAGES.find(l => l.code === pc);
  if (entry) {
    if (entry.aliases.some(a => a.toLowerCase() === tl)) return true;
    // startsWith — handles "en-US", "en-us" matching "en"
    if (entry.aliases.some(a => String(tl).startsWith(a.toLowerCase()))) return true;
    // The preferred code itself as a prefix
    if (String(tl).startsWith(pc)) return true;
  }

  // Fallback: startsWith on the raw code
  return String(tl).startsWith(pc);
}

/** Load subtitle settings from localStorage (or return defaults). */
export function loadSubtitleSettings(): SubtitleSettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

/** Save subtitle settings to localStorage. */
export function saveSubtitleSettings(s: SubtitleSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch { /* ignore */ }
}

// ============================================================
// useSubtitleSettings hook — state + persistence
// ============================================================

export function useSubtitleSettings() {
  const [settings, setSettings] = useState<SubtitleSettings>(DEFAULTS);

  // Load from localStorage on mount
  useEffect(() => {
    setSettings(loadSubtitleSettings());
  }, []);

  const update = useCallback((patch: Partial<SubtitleSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      saveSubtitleSettings(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setSettings(DEFAULTS);
    saveSubtitleSettings(DEFAULTS);
  }, []);

  return { settings, update, reset };
}

// ============================================================
// CustomSubtitleOverlay — renders subtitle cues as HTML div
// Replaces native ::cue so we can control font/position/opacity.
// ============================================================

interface CueData {
  text: string;
  startTime: number;
  endTime: number;
}

interface CustomSubtitleOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  settings: SubtitleSettings;
  activeTrackIndex: number; // which textTrack is active (-1 = off)
  controlsVisible?: boolean; // whether player controls are showing
  isMobile?: boolean; // mobile device
}

/**
 * Renders the active subtitle cue as an HTML overlay positioned over the video.
 *
 * Reads cues from the video's active TextTrack (set by the player's subtitle
 * selector). Applies the user's font/position/opacity/sync settings.
 *
 * Native ::cue is disabled via CSS (video::cue { visibility: hidden }) so
 * only this overlay shows.
 */
export function CustomSubtitleOverlay({
  videoRef,
  settings,
  activeTrackIndex,
  controlsVisible = false,
  isMobile = false,
}: CustomSubtitleOverlayProps) {
  const [currentCue, setCurrentCue] = useState<CueData | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Ref to track the last cue text we rendered — prevents unnecessary re-renders
  // (timeupdate fires 4-10x/s, but we only update state when the cue text changes)
  const lastCueTextRef = useRef<string | null>(null);
  const activeTrackIndexRef = useRef(activeTrackIndex);
  activeTrackIndexRef.current = activeTrackIndex;

  // ── ROBUST subtitle detection via timeupdate polling ──
  //
  // We use timeupdate (fires 4-10x/s during playback) as the SINGLE source of
  // truth for which cue is active. This is more reliable than cuechange because:
  //   1. cuechange can fire BEFORE our listener is attached (race condition)
  //   2. cuechange doesn't fire when seeking to a new position
  //   3. cuechange can be missed if the track mode is changed by hls.js
  //
  // To prevent flicker (the old bug), we use lastCueTextRef to compare the
  // current cue text with the previous one. We only call setCurrentCue when
  // the text actually CHANGES. This means React re-renders the overlay ONCE
  // per cue change — not 10x per second.
  //
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const checkCues = () => {
      const idx = activeTrackIndexRef.current;
      if (idx < 0 || idx >= video.textTracks.length) {
        // No active track — clear if we had a cue
        if (lastCueTextRef.current !== null) {
          lastCueTextRef.current = null;
          setCurrentCue(null);
        }
        return;
      }

      const track = video.textTracks[idx];
      // Force mode to 'hidden' so cues fire but native rendering is suppressed
      // (our overlay handles rendering). This is idempotent.
      if (track.mode === 'showing') {
        track.mode = 'hidden';
      }

      // ── Apply sync delay ──
      // The video's currentTime is adjusted by settings.syncDelay.
      // If syncDelay > 0: subs appear LATER (use video time - delay)
      // If syncDelay < 0: subs appear EARLIER (use video time + |delay|)
      // We use the ADJUSTED time to find the active cue, so the overlay
      // renders the cue that matches what the user should be seeing.
      const adjustedTime = video.currentTime - settings.syncDelay;

      // ── Find the active cue by scanning the track's cues directly ──
      // We don't rely on track.activeCues because it uses the video's
      // currentTime directly (not our adjusted time). By scanning manually,
      // we can apply the sync delay.
      const cues = track.cues;
      if (!cues || cues.length === 0) {
        if (lastCueTextRef.current !== null) {
          lastCueTextRef.current = null;
          setCurrentCue(null);
        }
        return;
      }

      let activeCue: VTTCue | null = null;
      for (let i = 0; i < cues.length; i++) {
        const cue = cues[i] as VTTCue;
        if (adjustedTime >= cue.startTime && adjustedTime <= cue.endTime) {
          activeCue = cue;
          break;
        }
      }

      if (!activeCue) {
        // No active cue — clear if we had one
        if (lastCueTextRef.current !== null) {
          lastCueTextRef.current = null;
          setCurrentCue(null);
        }
        return;
      }

      const cue = activeCue as VTTCue;
      const text = (cue.text || "").replace(/<[^>]+>/g, "");

      // Only update state if the cue text ACTUALLY changed
      // This prevents 10x/s re-renders (flicker) while still showing every cue
      if (text !== lastCueTextRef.current) {
        lastCueTextRef.current = text;
        setCurrentCue({
          text,
          startTime: cue.startTime,
          endTime: cue.endTime,
        });
      }
    };

    // Poll on timeupdate — fires during normal playback
    video.addEventListener("timeupdate", checkCues);
    // Also poll on seeked — catches cues when user jumps to a new position
    video.addEventListener("seeked", checkCues);
    // Also poll on addtrack — catches when HLS loads embedded subs
    video.textTracks.addEventListener("addtrack", checkCues);
    // Also poll on change — catches when track mode changes
    video.textTracks.addEventListener("change", checkCues);

    // ── Attach 'load' listener to each existing TextTrack ──
    // External <track> elements fire a 'load' event when their VTT file
    // finishes downloading. Without this, cues only get detected on the
    // NEXT timeupdate (4-10x/s) — which means a 250-1000ms delay where
    // the user sees no subtitles even though the track is "selected".
    // The load event gives us INSTANT cue detection.
    const attachLoadListeners = () => {
      for (let i = 0; i < video.textTracks.length; i++) {
        const track = video.textTracks[i];
        // Avoid double-attaching (would cause memory leak across re-renders)
        if ((track as any).__ltvLoadListener) continue;
        (track as any).__ltvLoadListener = true;
        track.addEventListener("load", checkCues);
        track.addEventListener("cuechange", checkCues);
      }
    };
    attachLoadListeners();
    // Re-attach when new tracks are added later (HLS loads subs async)
    video.textTracks.addEventListener("addtrack", attachLoadListeners);

    // Also do an initial check (in case video is already playing)
    checkCues();

    return () => {
      video.removeEventListener("timeupdate", checkCues);
      video.removeEventListener("seeked", checkCues);
      video.textTracks.removeEventListener("addtrack", checkCues);
      video.textTracks.removeEventListener("change", checkCues);
      video.textTracks.removeEventListener("addtrack", attachLoadListeners);
      // Clean up per-track listeners + __ltvLoadListener marker
      for (let i = 0; i < video.textTracks.length; i++) {
        const track = video.textTracks[i];
        if ((track as any).__ltvLoadListener) {
          track.removeEventListener("load", checkCues);
          track.removeEventListener("cuechange", checkCues);
          delete (track as any).__ltvLoadListener;
        }
      }
    };
  }, [videoRef]);

  // NOTE: No separate cuechange listener — timeupdate polling handles everything.
  // The old cuechange-only approach had a race condition where the listener
  // attached too late and missed the first cue.

  if (!currentCue || !currentCue.text) return null;

  // Parse HTML in cue text (VTT can have <b>, <i>, <u> tags — we stripped them above
  // but let's render line breaks properly)
  const lines = currentCue.text.split("\n");

  // On mobile, when controls are visible, push subtitles up so they
  // don't get covered by the floating control bar (~64px tall)
  const effectiveVerticalPos = isMobile && controlsVisible
    ? Math.min(settings.verticalPos, 72) // push up to 72% max when controls showing
    : settings.verticalPos;

  return (
    <div
      ref={containerRef}
      className="absolute pointer-events-none z-20"
      style={{
        left: `${settings.horizontalPos}%`,
        top: `${effectiveVerticalPos}%`,
        transform: "translate(-50%, -50%)",
        maxWidth: "90%",
        textAlign: "center",
      }}
    >
      <div
        style={{
          display: "inline-block",
          padding: "4px 12px",
          borderRadius: "6px",
          backgroundColor: `rgba(0, 0, 0, ${(settings.bgOpacity / 100) * 0.85})`,
          fontFamily: FONT_OPTIONS.find(f => f.label === settings.fontFamily)?.value || "Inter, sans-serif",
          // ── Responsive font size ──
          // On mobile (<=640px): use clamp(12px, 4vw, 18px) so it scales with screen width
          // On desktop (>640px): use the user's fontSize setting
          // This prevents subs from covering the whole screen on mobile.
          fontSize: `clamp(12px, 4vw, ${settings.fontSize}px)`,
          fontWeight: 700,
          color: "#ffffff",
          lineHeight: 1.3,
          letterSpacing: "0.01em",
          textShadow: "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 2px 4px rgba(0,0,0,0.8)",
          whiteSpace: "pre-wrap",
          wordWrap: "break-word",
        }}
      >
        {lines.map((line, i) => (
          <div key={i}>{line || "\u00A0"}</div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// SubtitleSettingsPanel — the UI panel (matching screenshot)
// ============================================================

interface SubtitleSettingsPanelProps {
  settings: SubtitleSettings;
  onUpdate: (patch: Partial<SubtitleSettings>) => void;
  onReset: () => void;
  onClose: () => void;
}

export function SubtitleSettingsPanel({
  settings,
  onUpdate,
  onReset,
  onClose,
}: SubtitleSettingsPanelProps) {
  return (
    <div
      className="absolute bottom-full right-0 mb-3 bg-black/80 backdrop-blur-2xl border border-white/15 rounded-2xl overflow-y-auto overflow-x-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200"
      style={{ width: "260px", maxWidth: "calc(100vw - 2rem)", maxHeight: "50vh" }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/10">
        <span className="text-xs font-bold text-white">Subtitle settings</span>
        <div className="flex items-center gap-3">
          <button
            onClick={onReset}
            className="text-[10px] font-bold text-white/40 hover:text-white transition-colors uppercase tracking-wider"
          >
            Reset
          </button>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="px-3 py-2.5 space-y-2.5">
        {/* Sliders — 2x2 grid */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <Slider
            label="Horizontal"
            value={settings.horizontalPos}
            min={0}
            max={100}
            step={1}
            unit="%"
            onChange={(v) => onUpdate({ horizontalPos: v })}
          />
          <Slider
            label="Vertical"
            value={settings.verticalPos}
            min={0}
            max={100}
            step={1}
            unit="%"
            onChange={(v) => onUpdate({ verticalPos: v })}
          />
          <Slider
            label="Size"
            value={settings.fontSize}
            min={12}
            max={48}
            step={1}
            unit="px"
            onChange={(v) => onUpdate({ fontSize: v })}
          />
          <Slider
            label="Background"
            value={settings.bgOpacity}
            min={0}
            max={100}
            step={5}
            unit="%"
            onChange={(v) => onUpdate({ bgOpacity: v })}
          />
        </div>

        {/* Sync delay — full width */}
        <Slider
          label="Sync"
          value={settings.syncDelay}
          min={-5}
          max={5}
          step={0.1}
          unit="s"
          onChange={(v) => onUpdate({ syncDelay: v })}
        />

        {/* Default subtitle language picker */}
        {/* Lets the user pick which language subtitle should auto-select when
            they start watching. Fixes the bug where some sources auto-pick
            Arabic/Chinese subtitles and the user can't change the default. */}
        <div className="pt-1.5 border-t border-white/8">
          <div className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2">Default subtitle</div>
          <div className="grid grid-cols-3 gap-1.5 max-h-32 overflow-y-auto ltv-subtitle-lang-scroll">
            {SUBTITLE_LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => onUpdate({ defaultSubtitleLang: lang.code })}
                className={`px-1.5 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                  settings.defaultSubtitleLang === lang.code
                    ? "bg-white text-black"
                    : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                }`}
                title={`Auto-select ${lang.label} subtitles when available`}
              >
                {lang.label}
              </button>
            ))}
          </div>
          <div className="mt-1.5 text-[9px] text-white/30 leading-tight">
            Auto-selects this language when subtitles are available. Pick "Off" to disable subtitles by default.
          </div>
        </div>

        {/* Font picker */}
        <div className="pt-1.5 border-t border-white/8">
          <div className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2">Font</div>
          <div className="grid grid-cols-4 gap-1.5">
            {FONT_OPTIONS.map((font) => (
              <button
                key={font.label}
                onClick={() => onUpdate({ fontFamily: font.label })}
                className={`px-2 py-2 rounded-lg text-[11px] font-medium transition-all ${
                  settings.fontFamily === font.label
                    ? "bg-white text-black"
                    : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                }`}
                style={{ fontFamily: font.value }}
              >
                {font.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Slider — reusable labeled slider
// ============================================================

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
}

function Slider({ label, value, min, max, step, unit, onChange }: SliderProps) {
  const percentage = ((value - min) / (max - min)) * 100;
  const displayValue = unit === "s" ? value.toFixed(1) : Math.round(value);

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider">{label}</span>
        <span className="text-[10px] font-bold text-white tabular-nums">
          {displayValue}{unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="ltv-subtitle-slider w-full"
        style={{
          background: `linear-gradient(to right, #fff 0%, #fff ${percentage}%, rgba(255,255,255,0.15) ${percentage}%, rgba(255,255,255,0.15) 100%)`,
        }}
      />
    </div>
  );
}
