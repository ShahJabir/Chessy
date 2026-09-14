// ---------------------------------------------------------------------------
// Horror theme — an abandoned arena in fog, candlelight and flicker.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { ArenaTheme, CaptureStyle, ThemeMeta } from "../arena/ArenaTheme";
import { BoardPalette } from "../board/Board3D";
import { PieceMaterials } from "../pieces/Piece3D";
import { AmbientField } from "../effects/ParticleManager";
import { FlickerLight, makeFlame } from "../effects/LightingEffects";
import { Easing, tweens, rand, noiseTexture } from "../three/util";
import {
  CheckEventPayload,
  CheckmateEventPayload,
  DrawEventPayload,
  MoveEventPayload,
} from "../arena/ArenaEvents";

export class HorrorTheme extends ArenaTheme {
  private key!: THREE.DirectionalLight;
  private keyBase = 0.7;
  private candles: { flicker: FlickerLight; light: THREE.PointLight }[] = [];
  private spot: THREE.SpotLight | null = null;
  private finalDarkness = false;

  meta(): ThemeMeta {
    return {
      id: "horror",
      name: "HORROR ABANDONED",
      tagline: "Something is watching the board.",
      description:
        "A ruined hall swallowed by fog. Captured pieces vanish into the dark, lights flicker when a king is hunted.",
      preview: "linear-gradient(170deg, #050508 0%, #101018 40%, #2a1a20 75%, #050505 100%)",
      accent: "#8a1a1a",
    };
  }

  palette(): BoardPalette {
    return {
      lightSquare: 0x6a6158,
      darkSquare: 0x241f1c,
      squareRoughness: 0.85,
      squareMetalness: 0.05,
      frame: 0x18130f,
      frameRoughness: 0.9,
      frameMetalness: 0.05,
      selection: 0xc9a86a,
      legalDot: 0xa89468,
      captureRing: 0xa02020,
      lastMove: 0x8a7a5c,
      check: 0xd91a1a,
    };
  }

  pieceMaterials(): PieceMaterials {
    return {
      white: new THREE.MeshStandardMaterial({
        color: 0xb8ab98,
        roughness: 0.78,
        metalness: 0.06,
        emissive: 0x000000,
      }),
      black: new THREE.MeshStandardMaterial({
        color: 0x18141a,
        roughness: 0.7,
        metalness: 0.2,
        emissive: 0x0a0508,
        emissiveIntensity: 0.2,
      }),
    };
  }

  captureStyle(): CaptureStyle {
    return {
      mode: "sink",
      duration: 1.3,
      spin: 1.2,
      fade: true,
      burst: { color: 0x4a4a52, color2: 0x18141a, count: 22, speed: 1.2, gravity: 0.6, size: 0.18 },
    };
  }

  build(): void {
    const s = this.ctx.scene;
    s.fog = new THREE.Fog(0x08080c, 9, 46);
    this.sky("#05050a", "#0c0c14", "#040406");

    this.hemi(0x1c1c28, 0x050505, 0.32);
    this.key = this.keyLight(0x8a9ac4, this.keyBase, new THREE.Vector3(-6, 14, 4));
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(3, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xc4cadd, fog: false }),
    );
    moon.position.set(-28, 26, -44);
    this.env.add(moon);

    // Cracked stone floor.
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(70, 26),
      new THREE.MeshStandardMaterial({
        color: 0x1c1a1e,
        roughness: 1,
        map: noiseTexture("#1c1a1e", "#0c0a0e", 900, 0.5),
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2.6;
    this.env.add(floor);

    // Ruined platform of old wood.
    const wood = new THREE.MeshStandardMaterial({
      color: 0x2e241a,
      roughness: 0.95,
      map: noiseTexture("#2e241a", "#1c140c", 600, 0.35),
    });
    this.platform(wood, 13.4, 1.1, -0.8);

    // Broken walls.
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x35313a,
      roughness: 0.95,
      map: noiseTexture("#35313a", "#221f26", 500, 0.4),
    });
    const mkRuin = (x: number, z: number, w: number, h: number, rot: number, tilt = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.8), wallMat);
      m.position.set(x, -0.5 + h / 2, z);
      m.rotation.y = rot;
      m.rotation.z = tilt;
      m.castShadow = true;
      m.receiveShadow = true;
      this.env.add(m);
    };
    mkRuin(-8.5, -4, 6, 4.5, Math.PI / 2, 0.06);
    mkRuin(-8.5, 3, 4, 2.6, Math.PI / 2, -0.1);
    mkRuin(8.5, -2, 7, 5.2, Math.PI / 2, 0.04);
    mkRuin(2, -8.5, 5, 3.4, 0, 0.08);
    mkRuin(-4, 8.5, 6, 2.2, 0, -0.06);

    // Dead trees.
    const treeMat = new THREE.MeshStandardMaterial({ color: 0x181410, roughness: 1 });
    const mkTree = (x: number, z: number, h: number) => {
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.3, h, 6), treeMat);
      trunk.position.y = h / 2;
      g.add(trunk);
      for (let i = 0; i < 4; i++) {
        const len = rand(1, 2.2);
        const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.09, len, 5), treeMat);
        branch.position.y = h * rand(0.45, 0.85);
        branch.rotation.z = rand(0.6, 1.2) * (Math.random() < 0.5 ? 1 : -1);
        branch.position.x = Math.sin(branch.rotation.z) * len * 0.4;
        g.add(branch);
      }
      g.position.set(x, -2.6, z);
      g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
      this.env.add(g);
    };
    mkTree(-12, -9, 6);
    mkTree(11, -11, 7);
    mkTree(-10, 10, 5.4);
    mkTree(13, 8, 6.4);

    // Candles around the board.
    for (const [x, z] of [[-4.9, -4.9], [4.9, -4.9], [-4.9, 4.9], [4.9, 4.9], [0, -5.4], [0, 5.4]] as [number, number][]) {
      const g = new THREE.Group();
      const wax = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.1, rand(0.3, 0.5), 8),
        new THREE.MeshStandardMaterial({ color: 0xc4b8a0, roughness: 0.6 }),
      );
      wax.position.y = 0.2;
      g.add(wax);
      const flame = makeFlame(0xffa030, 0.8);
      flame.position.y = 0.5;
      g.add(flame);
      const light = new THREE.PointLight(0xff9a30, 3.2, 6, 2);
      light.position.y = 0.55;
      g.add(light);
      g.position.set(x, -0.22, z);
      this.env.add(g);
      this.candles.push({ flicker: this.registerFlicker(new FlickerLight(light, { flame })), light });
    }

    // Low fog motes.
    const field = new AmbientField(s, {
      mode: "motes",
      count: 200,
      bounds: new THREE.Box3(new THREE.Vector3(-12, -1.5, -12), new THREE.Vector3(12, 4, 12)),
      color: 0x5a5a66,
      size: 0.22,
      opacity: 0.16,
    });
    this.ambients.push(field);
  }

  onMove(_ev: MoveEventPayload): void {
    // Very subtle: a whisper of dust, nothing more.
    const to = this.squarePos(_ev.move.to, 0.05);
    this.ctx.particles.burst({
      position: to,
      count: 4,
      color: 0x4a4a52,
      speed: 0.5,
      gravity: -0.4,
      life: 0.6,
      size: 0.08,
      direction: new THREE.Vector3(0, 1, 0),
      coneSpread: 0.8,
    });
  }

  onCheck(ev: CheckEventPayload): void {
    super.onCheck(ev);
    // Lights around the king begin flickering violently.
    tweens.add({
      duration: 1.8,
      onUpdate: (t) => {
        if (this.finalDarkness) return;
        for (const c of this.candles) {
          c.light.intensity = Math.random() < 0.2 ? 0.3 : 3.2;
        }
        this.key.intensity = Math.random() < 0.15 ? 0.15 : this.keyBase;
      },
      onComplete: () => {
        if (this.finalDarkness) return;
        for (const c of this.candles) c.light.intensity = 3.2;
        this.key.intensity = this.keyBase;
      },
    });
  }

  onCheckmate(ev: CheckmateEventPayload): void {
    // The arena goes dark; a single spotlight finds the winning king.
    this.finalDarkness = true;
    tweens.add({
      duration: 2.2,
      ease: Easing.quadInOut,
      onUpdate: (t) => {
        this.key.intensity = this.keyBase * (1 - t);
        for (const c of this.candles) c.light.intensity = 3.2 * (1 - t * 0.85);
      },
    });
    this.spot = new THREE.SpotLight(ev.winner === "w" ? 0xcfd8ff : 0xd8c8ff, 0, 30, 0.5, 0.45, 1.2);
    this.spot.position.set(0, 12, ev.winner === "w" ? 6 : -6);
    const target = new THREE.Object3D();
    target.position.set(0, 0, ev.winner === "w" ? 1.5 : -1.5);
    this.env.add(target);
    this.spot.target = target;
    this.env.add(this.spot);
    tweens.add({
      duration: 2,
      ease: Easing.quadOut,
      onUpdate: (t) => {
        if (this.spot) this.spot.intensity = 260 * t;
      },
    });
  }

  onDraw(_ev: DrawEventPayload): void {
    tweens.add({
      duration: 2,
      onUpdate: (t) => (this.key.intensity = this.keyBase * (1 - t * 0.5)),
    });
  }
}
