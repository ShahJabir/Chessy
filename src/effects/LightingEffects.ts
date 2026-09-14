// ---------------------------------------------------------------------------
// LightingEffects — flicker lights and pulsing light helpers used by themes.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { rand } from "../three/util";

export class FlickerLight {
  light: THREE.PointLight;
  private baseIntensity: number;
  private flame?: THREE.Object3D;
  private flameBaseScale = 1;
  private t = Math.random() * 10;

  constructor(
    light: THREE.PointLight,
    opts: { flame?: THREE.Object3D } = {},
  ) {
    this.light = light;
    this.baseIntensity = light.intensity;
    this.flame = opts.flame;
    if (this.flame) this.flameBaseScale = this.flame.scale.x;
  }

  update(dt: number): void {
    this.t += dt;
    const n =
      Math.sin(this.t * 11.3) * 0.5 + Math.sin(this.t * 23.7 + 1.3) * 0.3 + Math.sin(this.t * 5.1) * 0.2;
    this.light.intensity = this.baseIntensity * (1 + n * 0.25);
    if (this.flame) {
      const s = this.flameBaseScale * (1 + n * 0.18);
      this.flame.scale.setScalar(s);
    }
  }

  setColor(color: THREE.ColorRepresentation, intensityScale = 1): void {
    this.light.color.set(color);
    this.baseIntensity = this.light.intensity * intensityScale || this.baseIntensity;
  }

  setBaseIntensity(v: number): void {
    this.baseIntensity = v;
    this.light.intensity = v;
  }

  setFlameColor(color: THREE.ColorRepresentation): void {
    if (!this.flame) return;
    const mesh = this.flame as THREE.Mesh;
    const mat = mesh.material as THREE.MeshBasicMaterial | undefined;
    if (mat && mat.color) mat.color.set(color);
  }
}

/** Utility: quick emissive "flame" billboard-ish cone. */
export function makeFlame(color: THREE.ColorRepresentation, scale = 1): THREE.Mesh {
  const geo = new THREE.ConeGeometry(0.09 * scale, 0.28 * scale, 6);
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  return mesh;
}

/** Utility: a simple glowing sprite dot. */
export function makeGlowDot(color: THREE.ColorRepresentation, size = 0.3): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,0.5)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({
    map: tex,
    color,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.setScalar(size);
  return sprite;
}
