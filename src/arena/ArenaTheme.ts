// ---------------------------------------------------------------------------
// ArenaTheme — the theme interface. Chess events are interpreted by each
// theme independently; the engine and gameplay code know nothing about
// theme behavior. Adding a new theme = one new class + registry entry.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { Board3D, BoardPalette } from "../board/Board3D";
import { BoardCoordinates } from "../board/BoardCoordinates";
import { ParticleManager, BurstOptions, AmbientField } from "../effects/ParticleManager";
import { FlickerLight } from "../effects/LightingEffects";
import { AudioManager } from "../audio/AudioManager";
import { PieceMaterials } from "../pieces/Piece3D";
import { canvasTexture, disposeObject } from "../three/util";
import {
  ChessEvent,
  MoveEventPayload,
  CaptureEventPayload,
  CheckEventPayload,
  CheckmateEventPayload,
  PromotionEventPayload,
  CastleEventPayload,
  DrawEventPayload,
  GameStartEventPayload,
  GameEndEventPayload,
} from "./ArenaEvents";
import { Square } from "../chess/types";

export interface ThemeContext {
  scene: THREE.Scene;
  coords: BoardCoordinates;
  board: Board3D;
  particles: ParticleManager;
  audio: AudioManager;
  effectsEnabled: boolean;
  shadowsEnabled: boolean;
}

export interface CaptureStyle {
  mode: "topple" | "sink" | "float";
  duration: number;
  spin: number;
  fade: boolean;
  burst?: Partial<BurstOptions> & { count?: number };
}

export interface ThemeMeta {
  id: string;
  name: string;
  tagline: string;
  description: string;
  /** CSS gradient used for the selector preview card. */
  preview: string;
  accent: string;
}

export abstract class ArenaTheme {
  abstract meta(): ThemeMeta;
  abstract palette(): BoardPalette;
  abstract pieceMaterials(): PieceMaterials;
  abstract captureStyle(): CaptureStyle;

  protected ctx!: ThemeContext;
  protected env = new THREE.Group();
  protected flickers: FlickerLight[] = [];
  protected ambients: AmbientField[] = [];
  protected checkGlow: THREE.PointLight | null = null;
  protected time = 0;
  protected disposables: { dispose(): void }[] = [];

  /** Build the environment. Called once after ctx is assigned. */
  abstract build(): void;

  load(ctx: ThemeContext): void {
    this.ctx = ctx;
    this.env = new THREE.Group();
    this.env.name = `theme-env-${this.meta().id}`;
    ctx.scene.add(this.env);
    this.build();
    ctx.board.applyPalette(this.palette());
    if (this.checkGlow) this.checkGlow.intensity = 0;
  }

  // ------------------------------------------------------ event hooks

  onGameStart(_ev: GameStartEventPayload): void {}
  onGameEnd(_ev: GameEndEventPayload): void {}

  onMove(ev: MoveEventPayload): void {
    const pos = this.ctx.coords.squareToWorld(ev.move.to, 0.05);
    this.ctx.particles.burst({
      position: pos,
      count: 10,
      speed: 1.1,
      spread: 0.25,
      gravity: -1.5,
      life: 0.5,
      size: 0.1,
      color: 0xc9b48a,
      direction: new THREE.Vector3(0, 1, 0),
      coneSpread: 0.9,
    });
  }

  onCapture(ev: CaptureEventPayload): void {
    const style = this.captureStyle();
    if (style.burst) {
      const pos = this.ctx.coords.squareToWorld(ev.capturedSquare, 0.5);
      this.ctx.particles.burst({
        position: pos,
        count: style.burst.count ?? 26,
        color: style.burst.color ?? 0xffffff,
        color2: style.burst.color2,
        speed: style.burst.speed ?? 2.4,
        gravity: style.burst.gravity ?? -6,
        life: 0.9,
        size: style.burst.size ?? 0.14,
        additive: style.burst.additive,
        direction: new THREE.Vector3(0, 1, 0),
        coneSpread: 1,
      });
    }
  }

  onCheck(ev: CheckEventPayload): void {
    // Default: a pulsing red glow on the threatened king. Themes override.
    if (!this.checkGlow) {
      this.checkGlow = new THREE.PointLight(0xff2a1a, 0, 7, 1.8);
      this.ctx.scene.add(this.checkGlow);
    }
    const pos = this.ctx.coords.squareToWorld(ev.kingSquare, 1.4);
    this.checkGlow.position.copy(pos);
    this.checkGlow.intensity = 14;
  }

  onCheckCleared(): void {
    if (this.checkGlow) this.checkGlow.intensity = 0;
  }

  onCheckmate(_ev: CheckmateEventPayload): void {}
  onPromotion(ev: PromotionEventPayload): void {
    const pos = this.ctx.coords.squareToWorld(ev.square, 0.8);
    this.ctx.particles.burst({
      position: pos,
      count: 34,
      color: 0xffe28a,
      color2: 0xffffff,
      speed: 2.6,
      gravity: -1.5,
      life: 1,
      size: 0.16,
      additive: true,
      direction: new THREE.Vector3(0, 1, 0),
      coneSpread: 0.8,
    });
  }
  onCastle(_ev: CastleEventPayload): void {}
  onDraw(_ev: DrawEventPayload): void {}

  /** Per-frame environment animation. */
  update(dt: number): void {
    this.time += dt;
    for (const f of this.flickers) f.update(dt);
    for (const a of this.ambients) a.update(dt, this.time);
    if (this.checkGlow && this.checkGlow.intensity > 0) {
      this.checkGlow.intensity = 10 + Math.sin(this.time * 7) * 5;
    }
  }

  handleEvent(ev: ChessEvent): void {
    switch (ev.type) {
      case "gamestart": this.onGameStart(ev); break;
      case "gameend": this.onGameEnd(ev); break;
      case "move": this.onMove(ev); break;
      case "capture": this.onCapture(ev); break;
      case "check": this.onCheck(ev); break;
      case "checkmate": this.onCheckmate(ev); break;
      case "promotion": this.onPromotion(ev); break;
      case "castle": this.onCastle(ev); break;
      case "draw": this.onDraw(ev); break;
    }
  }

  // ------------------------------------------------------ shared helpers

  /** Gradient sky dome (BackSide sphere). */
  protected sky(top: string, horizon: string, bottom: string, radius = 90): THREE.Mesh {
    const tex = canvasTexture(128, (ctx, s) => {
      const g = ctx.createLinearGradient(0, 0, 0, s);
      g.addColorStop(0, top);
      g.addColorStop(0.55, horizon);
      g.addColorStop(1, bottom);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    });
    const geo = new THREE.SphereGeometry(radius, 24, 16);
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = -10;
    this.env.add(mesh);
    this.disposables.push(tex);
    return mesh;
  }

  /** Key directional light with shadows sized to the board. */
  protected keyLight(
    color: THREE.ColorRepresentation,
    intensity: number,
    pos: THREE.Vector3,
  ): THREE.DirectionalLight {
    const light = new THREE.DirectionalLight(color, intensity);
    light.position.copy(pos);
    light.target.position.set(0, 0, 0);
    if (this.ctx.shadowsEnabled) {
      light.castShadow = true;
      light.shadow.mapSize.set(2048, 2048);
      light.shadow.camera.left = -7;
      light.shadow.camera.right = 7;
      light.shadow.camera.top = 7;
      light.shadow.camera.bottom = -7;
      light.shadow.camera.near = 1;
      light.shadow.camera.far = 40;
      light.shadow.bias = -0.0015;
    }
    this.env.add(light);
    this.env.add(light.target);
    return light;
  }

  protected hemi(
    skyColor: THREE.ColorRepresentation,
    groundColor: THREE.ColorRepresentation,
    intensity: number,
  ): THREE.HemisphereLight {
    const h = new THREE.HemisphereLight(skyColor, groundColor, intensity);
    this.env.add(h);
    return h;
  }

  /** The platform the board physically sits on (stone/wood/metal slab). */
  protected platform(
    material: THREE.Material,
    size = 13,
    height = 1.2,
    y = -0.85,
  ): THREE.Mesh {
    const geo = new THREE.BoxGeometry(size, height, size);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.y = y;
    mesh.receiveShadow = true;
    this.env.add(mesh);
    return mesh;
  }

  protected registerFlicker(f: FlickerLight): FlickerLight {
    this.flickers.push(f);
    return f;
  }

  dispose(): void {
    for (const a of this.ambients) a.dispose(this.ctx.scene);
    this.ambients = [];
    if (this.checkGlow) {
      this.ctx.scene.remove(this.checkGlow);
      this.checkGlow = null;
    }
    this.ctx.scene.remove(this.env);
    disposeObject(this.env);
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.flickers = [];
  }

  /** Helper for event square world positions. */
  protected squarePos(square: Square, y = 0): THREE.Vector3 {
    return this.ctx.coords.squareToWorld(square, y);
  }
}
