// ---------------------------------------------------------------------------
// Settings store — persisted to localStorage.
// ---------------------------------------------------------------------------

import { Difficulty } from "./ai/Search";
import { Color } from "./chess/types";

export type Quality = "low" | "medium" | "high";

export interface GraphicsSettings {
  quality: Quality;
  shadows: boolean;
  effects: boolean;
  antialias: boolean;
  pixelRatio: number; // 0.75 .. 2 (cap on devicePixelRatio)
}

export interface AudioSettings {
  master: number;
  music: number;
  sfx: number;
  ambient: number;
}

export interface GameplaySettings {
  showLegalMoves: boolean;
  confirmMove: boolean;
  animationSpeed: number; // 0.5 slow .. 2 fast
  cameraEffects: boolean;
}

export interface AccessibilitySettings {
  reducedMotion: boolean;
  highContrast: boolean;
  screenShake: boolean;
}

export interface GameDefaults {
  theme: string;
  difficulty: Difficulty;
  playerColor: Color | "random";
  clockPreset: string; // "unlimited", "1+0", "3+2" ...
}

export interface Settings {
  graphics: GraphicsSettings;
  audio: AudioSettings;
  gameplay: GameplaySettings;
  accessibility: AccessibilitySettings;
  defaults: GameDefaults;
}

const KEY = "chess-arena-settings-v1";

export const DEFAULT_SETTINGS: Settings = {
  graphics: {
    quality: "high",
    shadows: true,
    effects: true,
    antialias: true,
    pixelRatio: Math.min(2, typeof devicePixelRatio !== "undefined" ? devicePixelRatio : 1),
  },
  audio: { master: 0.8, music: 0.5, sfx: 0.9, ambient: 0.6 },
  gameplay: {
    showLegalMoves: true,
    confirmMove: false,
    animationSpeed: 1,
    cameraEffects: true,
  },
  accessibility: { reducedMotion: false, highContrast: false, screenShake: true },
  defaults: {
    theme: "medieval",
    difficulty: "medium",
    playerColor: "w",
    clockPreset: "unlimited",
  },
};

function deepMerge<T>(base: T, patch: Partial<T> | undefined): T {
  if (!patch) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const k of Object.keys(patch)) {
    const bv = (base as Record<string, unknown>)[k];
    const pv = (patch as Record<string, unknown>)[k];
    if (bv && pv && typeof bv === "object" && typeof pv === "object" && !Array.isArray(bv)) {
      out[k] = deepMerge(bv, pv as Partial<typeof bv>);
    } else if (pv !== undefined) {
      out[k] = pv;
    }
  }
  return out as T;
}

class SettingsStore {
  private current: Settings;
  private listeners = new Set<(s: Settings) => void>();

  constructor() {
    this.current = this.load();
  }

  private load(): Settings {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return deepMerge(DEFAULT_SETTINGS, JSON.parse(raw));
    } catch {
      /* ignore */
    }
    return structuredClone(DEFAULT_SETTINGS);
  }

  get(): Settings {
    return this.current;
  }

  update(patch: (s: Settings) => void): void {
    const next = structuredClone(this.current);
    patch(next);
    this.current = next;
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    for (const l of [...this.listeners]) l(next);
  }

  onChange(listener: (s: Settings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const settings = new SettingsStore();

export const CLOCK_PRESETS: { id: string; label: string; baseMin: number; incSec: number }[] = [
  { id: "unlimited", label: "Unlimited", baseMin: 0, incSec: 0 },
  { id: "1+0", label: "1 + 0  (Bullet)", baseMin: 1, incSec: 0 },
  { id: "3+0", label: "3 + 0  (Blitz)", baseMin: 3, incSec: 0 },
  { id: "3+2", label: "3 + 2  (Blitz)", baseMin: 3, incSec: 2 },
  { id: "5+0", label: "5 + 0  (Blitz)", baseMin: 5, incSec: 0 },
  { id: "5+3", label: "5 + 3  (Blitz)", baseMin: 5, incSec: 3 },
  { id: "10+0", label: "10 + 0  (Rapid)", baseMin: 10, incSec: 0 },
  { id: "10+5", label: "10 + 5  (Rapid)", baseMin: 10, incSec: 5 },
  { id: "15+10", label: "15 + 10  (Rapid)", baseMin: 15, incSec: 10 },
  { id: "30+0", label: "30 + 0  (Classical)", baseMin: 30, incSec: 0 },
];

export function clockPreset(id: string) {
  return CLOCK_PRESETS.find((p) => p.id === id) ?? CLOCK_PRESETS[0];
}
