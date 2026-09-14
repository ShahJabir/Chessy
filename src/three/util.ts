// ---------------------------------------------------------------------------
// Small utilities: easings, a frame-driven tween manager, canvas textures.
// ---------------------------------------------------------------------------

import * as THREE from "three";

export type Ease = (t: number) => number;

export const Easing = {
  linear: (t: number) => t,
  quadIn: (t: number) => t * t,
  quadOut: (t: number) => t * (2 - t),
  quadInOut: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  cubicOut: (t: number) => 1 + --t * t * t * t,
  cubicInOut: (t: number) =>
    t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  backOut: (t: number) => {
    const s = 1.70158;
    return --t * t * ((s + 1) * t + s) + 1;
  },
  sineInOut: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
};

export interface Tween {
  elapsed: number;
  duration: number;
  ease: Ease;
  onUpdate: (t: number) => void;
  onComplete?: () => void;
  done: boolean;
}

class TweenManager {
  private tweens = new Set<Tween>();

  add(opts: {
    duration: number;
    ease?: Ease;
    onUpdate: (t: number) => void;
    onComplete?: () => void;
  }): Tween {
    const tween: Tween = {
      elapsed: 0,
      duration: Math.max(0.001, opts.duration),
      ease: opts.ease ?? Easing.quadInOut,
      onUpdate: opts.onUpdate,
      onComplete: opts.onComplete,
      done: false,
    };
    this.tweens.add(tween);
    return tween;
  }

  cancel(tween: Tween): void {
    this.tweens.delete(tween);
  }

  clear(): void {
    this.tweens.clear();
  }

  update(dt: number): void {
    for (const tw of [...this.tweens]) {
      tw.elapsed += dt;
      const t = Math.min(1, tw.elapsed / tw.duration);
      tw.onUpdate(tw.ease(t));
      if (t >= 1) {
        this.tweens.delete(tw);
        tw.done = true;
        tw.onComplete?.();
      }
    }
  }

  get activeCount(): number {
    return this.tweens.size;
  }
}

export const tweens = new TweenManager();

export function delay(seconds: number): Promise<void> {
  return new Promise((resolve) => tweens.add({ duration: seconds, onUpdate: () => {}, onComplete: resolve }));
}

// ------------------------------------------------------------------ textures

/** Simple 2D canvas texture factory used for procedural materials. */
export function canvasTexture(
  size: number,
  draw: (ctx: CanvasRenderingContext2D, size: number) => void,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function noiseTexture(
  base: string,
  speckle: string,
  amount = 900,
  speckleAlpha = 0.08,
): THREE.CanvasTexture {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    ctx.globalAlpha = speckleAlpha;
    for (let i = 0; i < amount; i++) {
      ctx.fillStyle = speckle;
      const r = Math.random() * 2 + 0.4;
      ctx.beginPath();
      ctx.arc(Math.random() * s, Math.random() * s, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  });
}

export function gradientTexture(stops: [number, string][]): THREE.CanvasTexture {
  return canvasTexture(64, (ctx, s) => {
    const g = ctx.createLinearGradient(0, s, 0, 0);
    for (const [pos, color] of stops) g.addColorStop(pos, color);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

export function disposeObject(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => disposeMaterial(m));
    else if (mat) disposeMaterial(mat);
  });
}

function disposeMaterial(m: THREE.Material): void {
  const anyM = m as unknown as Record<string, unknown>;
  for (const key of ["map", "normalMap", "roughnessMap", "emissiveMap", "alphaMap"]) {
    const tex = anyM[key];
    if (tex && tex instanceof THREE.Texture) tex.dispose();
  }
  m.dispose();
}

export function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
