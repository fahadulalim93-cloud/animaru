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
}

const DEFAULTS: SubtitleSettings = {
  fontSize: 20,
  horizontalPos: 50,
  verticalPos: 89,
  bgOpacity: 0,
  syncDelay: 0,
  fontFamily: "Inter",
};

const STORAGE_KEY = "luffytv_subtitle_settings";

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

  // Listen for cue changes on the active text track
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let activeTrack: TextTrack | null = null;
    let onCueChange: (() => void) | null = null;

    const findActiveTrack = () => {
      const tracks = video.textTracks;
      if (activeTrackIndex >= 0 && activeTrackIndex < tracks.length) {
        activeTrack = tracks[activeTrackIndex];
        // Set mode to 'hidden' so cues fire but native rendering is suppressed
        activeTrack.mode = "hidden";

        // Attach cuechange listener
        onCueChange = () => {
          if (!activeTrack || !activeTrack.activeCues || activeTrack.activeCues.length === 0) {
            setCurrentCue(null);
            return;
          }
          const cue = activeTrack.activeCues[0] as VTTCue;
          // Strip HTML tags from cue text (VTT can contain <b>, <i>, etc.)
          const text = (cue.text || "").replace(/<[^>]+>/g, "");
          setCurrentCue({
            text,
            startTime: cue.startTime,
            endTime: cue.endTime,
          });
        };
        activeTrack.addEventListener("cuechange", onCueChange);
      }
    };

    findActiveTrack();

    // Also re-find when textTracks list changes (HLS loads subs asynchronously)
    const onAddTrack = () => {
      // Clean up old listener
      if (activeTrack && onCueChange) {
        activeTrack.removeEventListener("cuechange", onCueChange);
      }
      findActiveTrack();
    };
    video.textTracks.addEventListener("addtrack", onAddTrack);

    return () => {
      video.textTracks.removeEventListener("addtrack", onAddTrack);
      if (activeTrack && onCueChange) {
        activeTrack.removeEventListener("cuechange", onCueChange);
      }
    };
  }, [videoRef, activeTrackIndex]);

  // Apply sync delay — hide cue if we're outside the (adjusted) time window
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentCue) return;

    const checkSync = () => {
      const adjustedTime = video.currentTime - settings.syncDelay;
      if (adjustedTime < currentCue.startTime || adjustedTime > currentCue.endTime) {
        // Outside the cue window (after sync adjustment) — clear it
        setCurrentCue(null);
      }
    };

    video.addEventListener("timeupdate", checkSync);
    return () => video.removeEventListener("timeupdate", checkSync);
  }, [videoRef, currentCue, settings.syncDelay]);

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
          fontSize: `${settings.fontSize}px`,
          fontWeight: 700,
          color: "#ffffff",
          lineHeight: 1.3,
          letterSpacing: "0.01em",
          textShadow: "0 1px 3px rgba(0,0,0,0.9)",
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
      className="absolute bottom-full right-0 mb-3 bg-black/80 backdrop-blur-2xl border border-white/15 rounded-2xl overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200"
      style={{ width: "320px", maxWidth: "calc(100vw - 32px)" }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
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
      <div className="px-4 py-3 space-y-3">
        {/* Sliders — 2x2 grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
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

        {/* Font picker */}
        <div className="pt-2 border-t border-white/8">
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
