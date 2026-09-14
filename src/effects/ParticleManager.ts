// ---------------------------------------------------------------------------
// ParticleManager — pooled GPU-friendly particles.
//
//  * burst(): short-lived effects (dust, sparks, fragments, glyphs)
//  * ambient fields: looping environmental particles (embers, rain, petals…)
//
// Everything is allocated once and recycled; no per-frame allocations.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { rand } from "../three/util";

const MAX_BURST_PARTICLES = 1500;

export interface BurstOptions {
  count?: number;
  color?: THREE.ColorRepresentation;
  color2?: THREE.ColorRepresentation;
  position: THREE.Vector3;
  spread?: number; // initial random offset radius
  speed?: number;
  direction?: THREE.Vector3; // bias direction (normalized)
  coneSpread?: number; // 0..1, how much to deviate from direction
  gravity?: number; // negative = falls
  drag?: number;
  life?: number;
  size?: number;
  sizeDecay?: boolean;
  additive?: boolean;
}

interface Particle {
  alive: boolean;
  life: number;
  maxLife: number;
  vx: number;
  vy: number;
  vz: number;
  gravity: number;
  drag: number;
  size: number;
  sizeDecay: boolean;
}

const VERT = /* glsl */ `
attribute float size;
attribute float alpha;
attribute vec3 pcolor;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vAlpha = alpha;
  vColor = pcolor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * (240.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
precision mediump float;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.5) discard;
  float soft = smoothstep(0.5, 0.12, d);
  gl_FragColor = vec4(vColor, vAlpha * soft);
}
`;

export class ParticleManager {
  readonly object: THREE.Points;
  private particles: Particle[] = [];
  private positions: Float32Array;
  private colors: Float32Array;
  private sizes: Float32Array;
  private alphas: Float32Array;
  private geometry: THREE.BufferGeometry;
  private material: THREE.ShaderMaterial;
  enabled = true;

  constructor(scene: THREE.Scene) {
    this.positions = new Float32Array(MAX_BURST_PARTICLES * 3);
    this.colors = new Float32Array(MAX_BURST_PARTICLES * 3);
    this.sizes = new Float32Array(MAX_BURST_PARTICLES);
    this.alphas = new Float32Array(MAX_BURST_PARTICLES);
    for (let i = 0; i < MAX_BURST_PARTICLES; i++) {
      this.particles.push({
        alive: false, life: 0, maxLife: 1, vx: 0, vy: 0, vz: 0,
        gravity: 0, drag: 0, size: 1, sizeDecay: true,
      });
      this.positions[i * 3 + 1] = -9999;
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("pcolor", new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute("size", new THREE.BufferAttribute(this.sizes, 1));
    this.geometry.setAttribute("alpha", new THREE.BufferAttribute(this.alphas, 1));
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1000);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    this.object = new THREE.Points(this.geometry, this.material);
    this.object.frustumCulled = false;
    this.object.renderOrder = 20;
    scene.add(this.object);
  }

  setBlending(additive: boolean): void {
    this.material.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
  }

  burst(opts: BurstOptions): void {
    if (!this.enabled) return;
    const count = opts.count ?? 24;
    const c1 = new THREE.Color(opts.color ?? 0xffffff);
    const c2 = new THREE.Color(opts.color2 ?? opts.color ?? 0xffffff);
    const dir = opts.direction?.clone().normalize() ?? new THREE.Vector3(0, 1, 0);
    const cone = opts.coneSpread ?? 1;
    let spawned = 0;
    for (let i = 0; i < MAX_BURST_PARTICLES && spawned < count; i++) {
      const p = this.particles[i];
      if (p.alive) continue;
      p.alive = true;
      p.maxLife = p.life = (opts.life ?? 0.8) * rand(0.6, 1.25);
      p.gravity = opts.gravity ?? -4;
      p.drag = opts.drag ?? 0.9;
      p.size = (opts.size ?? 0.16) * rand(0.6, 1.4);
      p.sizeDecay = opts.sizeDecay ?? true;

      const spread = opts.spread ?? 0.12;
      const speed = (opts.speed ?? 2) * rand(0.4, 1.3);
      const v = new THREE.Vector3(
        dir.x + rand(-cone, cone),
        dir.y + rand(-cone, cone),
        dir.z + rand(-cone, cone),
      ).normalize();
      p.vx = v.x * speed;
      p.vy = v.y * speed;
      p.vz = v.z * speed;

      this.positions[i * 3] = opts.position.x + rand(-spread, spread);
      this.positions[i * 3 + 1] = opts.position.y + rand(-spread, spread);
      this.positions[i * 3 + 2] = opts.position.z + rand(-spread, spread);

      const mix = Math.random();
      this.colors[i * 3] = c1.r + (c2.r - c1.r) * mix;
      this.colors[i * 3 + 1] = c1.g + (c2.g - c1.g) * mix;
      this.colors[i * 3 + 2] = c1.b + (c2.b - c1.b) * mix;
      this.sizes[i] = p.size;
      this.alphas[i] = 1;
      spawned++;
    }
    if (opts.additive) this.setBlending(true);
    this.markDirty();
  }

  update(dt: number): void {
    if (!this.enabled) return;
    let anyAlive = false;
    for (let i = 0; i < MAX_BURST_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.alive) continue;
      anyAlive = true;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        this.positions[i * 3 + 1] = -9999;
        this.alphas[i] = 0;
        continue;
      }
      const dampen = Math.pow(1 - p.drag * 0.1, dt * 60);
      p.vx *= dampen;
      p.vz *= dampen;
      p.vy = p.vy * dampen + p.gravity * dt;
      this.positions[i * 3] += p.vx * dt;
      this.positions[i * 3 + 1] += p.vy * dt;
      this.positions[i * 3 + 2] += p.vz * dt;
      const t = p.life / p.maxLife;
      this.alphas[i] = Math.min(1, t * 2);
      if (p.sizeDecay) this.sizes[i] = p.size * (0.4 + 0.6 * t);
    }
    if (anyAlive) this.markDirty();
  }

  private markDirty(): void {
    (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.alpha as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.size as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.pcolor as THREE.BufferAttribute).needsUpdate = true;
  }

  clear(): void {
    for (let i = 0; i < MAX_BURST_PARTICLES; i++) {
      this.particles[i].alive = false;
      this.positions[i * 3 + 1] = -9999;
      this.alphas[i] = 0;
    }
    this.markDirty();
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.object);
    this.geometry.dispose();
    this.material.dispose();
  }
}

// ---------------------------------------------------------------------------
// AmbientField — a looping field of environmental particles.
// ---------------------------------------------------------------------------

export type AmbientMode = "embers" | "rain" | "petals" | "sand" | "motes" | "snow" | "digital";

export interface AmbientFieldOptions {
  mode: AmbientMode;
  count: number;
  bounds: THREE.Box3; // world-space volume
  color: THREE.ColorRepresentation;
  color2?: THREE.ColorRepresentation;
  size?: number;
  opacity?: number;
  additive?: boolean;
}

export class AmbientField {
  readonly object: THREE.Points;
  private geometry: THREE.BufferGeometry;
  private material: THREE.ShaderMaterial;
  private positions: Float32Array;
  private seeds: Float32Array;
  private opts: AmbientFieldOptions;
  visible = true;

  constructor(scene: THREE.Scene, opts: AmbientFieldOptions) {
    this.opts = opts;
    const n = opts.count;
    this.positions = new Float32Array(n * 3);
    this.seeds = new Float32Array(n * 2);
    const colors = new Float32Array(n * 3);
    const sizes = new Float32Array(n);
    const c1 = new THREE.Color(opts.color);
    const c2 = new THREE.Color(opts.color2 ?? opts.color);
    const b = opts.bounds;
    for (let i = 0; i < n; i++) {
      this.positions[i * 3] = rand(b.min.x, b.max.x);
      this.positions[i * 3 + 1] = rand(b.min.y, b.max.y);
      this.positions[i * 3 + 2] = rand(b.min.z, b.max.z);
      this.seeds[i * 2] = Math.random() * Math.PI * 2;
      this.seeds[i * 2 + 1] = rand(0.5, 1.5);
      const mix = Math.random();
      colors[i * 3] = c1.r + (c2.r - c1.r) * mix;
      colors[i * 3 + 1] = c1.g + (c2.g - c1.g) * mix;
      colors[i * 3 + 2] = c1.b + (c2.b - c1.b) * mix;
      sizes[i] = (opts.size ?? 0.1) * rand(0.5, 1.5);
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("pcolor", new THREE.BufferAttribute(colors, 3));
    this.geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
    const alphas = new Float32Array(n).fill(opts.opacity ?? 0.8);
    this.geometry.setAttribute("alpha", new THREE.BufferAttribute(alphas, 1));
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1000);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.object = new THREE.Points(this.geometry, this.material);
    this.object.frustumCulled = false;
    this.object.renderOrder = 19;
    scene.add(this.object);
  }

  update(dt: number, time: number): void {
    if (!this.visible) return;
    const b = this.opts.bounds;
    const n = this.opts.count;
    const mode = this.opts.mode;
    for (let i = 0; i < n; i++) {
      const seed = this.seeds[i * 2];
      const speed = this.seeds[i * 2 + 1];
      let x = this.positions[i * 3];
      let y = this.positions[i * 3 + 1];
      let z = this.positions[i * 3 + 2];
      switch (mode) {
        case "embers":
          y += speed * 0.9 * dt;
          x += Math.sin(time * 1.5 + seed) * 0.22 * dt;
          z += Math.cos(time * 1.2 + seed) * 0.18 * dt;
          break;
        case "rain":
          y -= speed * 14 * dt;
          x += 1.5 * dt;
          break;
        case "petals":
          y -= speed * 0.5 * dt;
          x += Math.sin(time * 0.9 + seed) * 0.6 * dt + 0.35 * dt;
          z += Math.cos(time * 0.7 + seed * 2) * 0.4 * dt;
          break;
        case "sand":
          x += speed * 1.6 * dt;
          y += Math.sin(time + seed) * 0.08 * dt;
          break;
        case "motes":
          y += Math.sin(time * 0.5 + seed) * 0.05 * dt;
          x += Math.cos(time * 0.4 + seed) * 0.06 * dt;
          break;
        case "snow":
          y -= speed * 0.6 * dt;
          x += Math.sin(time * 0.8 + seed) * 0.25 * dt;
          break;
        case "digital":
          y += speed * 1.2 * dt;
          break;
      }
      // Wrap into bounds.
      if (y > b.max.y) y = b.min.y;
      if (y < b.min.y) y = b.max.y;
      if (x > b.max.x) x = b.min.x;
      if (x < b.min.x) x = b.max.x;
      if (z > b.max.z) z = b.min.z;
      if (z < b.min.z) z = b.max.z;
      this.positions[i * 3] = x;
      this.positions[i * 3 + 1] = y;
      this.positions[i * 3 + 2] = z;
    }
    (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.object);
    this.geometry.dispose();
    this.material.dispose();
  }
}
