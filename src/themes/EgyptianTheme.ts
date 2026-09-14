// ---------------------------------------------------------------------------
// Ancient Egypt theme — sandstone, gold, pyramids under a burning sunset.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { ArenaTheme, CaptureStyle, ThemeMeta } from "../arena/ArenaTheme";
import { BoardPalette } from "../board/Board3D";
import { PieceMaterials } from "../pieces/Piece3D";
import { AmbientField } from "../effects/ParticleManager";
import { FlickerLight } from "../effects/LightingEffects";
import { buildTorch } from "./common";
import { Easing, tweens, noiseTexture } from "../three/util";
import {
  CheckmateEventPayload,
  CheckEventPayload,
  DrawEventPayload,
} from "../arena/ArenaEvents";

export class EgyptianTheme extends ArenaTheme {
  private obeliskGlyphs: THREE.MeshBasicMaterial[] = [];
  private sun!: THREE.DirectionalLight;
  private winnerLight: THREE.PointLight | null = null;

  meta(): ThemeMeta {
    return {
      id: "egypt",
      name: "ANCIENT EGYPT",
      tagline: "Gold beneath a dying sun.",
      description:
        "A temple plateau between pyramids. Defeated pieces crumble to sand, ancient glyphs ignite when a king is threatened.",
      preview: "linear-gradient(165deg, #3a1d4a 0%, #a04a2a 40%, #e8a33c 72%, #5e3a1a 100%)",
      accent: "#e8a33c",
    };
  }

  palette(): BoardPalette {
    return {
      lightSquare: 0xdfc294,
      darkSquare: 0x7a5230,
      squareRoughness: 0.7,
      squareMetalness: 0.12,
      frame: 0x8a6a2c,
      frameRoughness: 0.42,
      frameMetalness: 0.55,
      selection: 0xffd24a,
      legalDot: 0xffd24a,
      captureRing: 0xe05a2a,
      lastMove: 0xffe9a0,
      check: 0xff5a1a,
    };
  }

  pieceMaterials(): PieceMaterials {
    return {
      white: new THREE.MeshStandardMaterial({
        color: 0xe9d8a8,
        roughness: 0.5,
        metalness: 0.28,
        emissive: 0x000000,
      }),
      black: new THREE.MeshStandardMaterial({
        color: 0x2c2016,
        roughness: 0.45,
        metalness: 0.4,
        emissive: 0x30180a,
        emissiveIntensity: 0.12,
      }),
    };
  }

  captureStyle(): CaptureStyle {
    return {
      mode: "sink",
      duration: 1.1,
      spin: 1.6,
      fade: true,
      burst: { color: 0xdfc294, color2: 0xb08d55, count: 34, speed: 2.2, gravity: -7, size: 0.15 },
    };
  }

  build(): void {
    const s = this.ctx.scene;
    s.fog = new THREE.Fog(0xd99a5a, 30, 95);
    this.sky("#2e1a4a", "#e0703a", "#c98a3a");

    this.hemi(0xffc98a, 0x5a3a20, 0.85);
    this.sun = this.keyLight(0xffb060, 2.9, new THREE.Vector3(-10, 9, 4));

    // Desert ground.
    const sand = new THREE.Mesh(
      new THREE.CircleGeometry(90, 30),
      new THREE.MeshStandardMaterial({
        color: 0xd9ab6a,
        roughness: 1,
        map: noiseTexture("#c99a5a", "#b08d55", 700, 0.25),
      }),
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.y = -3.4;
    sand.receiveShadow = true;
    this.env.add(sand);

    // Sandstone temple plateau.
    const sandstone = new THREE.MeshStandardMaterial({
      color: 0xc7a468,
      roughness: 0.85,
      map: noiseTexture("#b8985e", "#a0824c", 500, 0.2),
    });
    this.platform(sandstone, 14.6, 1.5, -1);
    const step = new THREE.Mesh(new THREE.BoxGeometry(17.5, 0.7, 17.5), sandstone);
    step.position.y = -2.1;
    step.receiveShadow = true;
    this.env.add(step);
    // Gold inlay ring.
    const inlay = new THREE.Mesh(
      new THREE.BoxGeometry(10.9, 0.06, 10.9),
      new THREE.MeshStandardMaterial({ color: 0xd8a832, roughness: 0.3, metalness: 0.9 }),
    );
    inlay.position.y = -0.22;
    this.env.add(inlay);

    // Pyramids.
    const pyramidMat = new THREE.MeshStandardMaterial({ color: 0xc49a58, roughness: 0.95, flatShading: true });
    const mkPyramid = (x: number, z: number, r: number) => {
      const p = new THREE.Mesh(new THREE.ConeGeometry(r, r * 1.15, 4), pyramidMat);
      p.position.set(x, -3.4 + (r * 1.15) / 2, z);
      p.rotation.y = Math.PI / 4;
      this.env.add(p);
    };
    mkPyramid(-30, -34, 16);
    mkPyramid(26, -44, 22);
    mkPyramid(-8, -56, 26);

    // Obelisks with glowing glyph strips.
    const mkObelisk = (x: number, z: number) => {
      const g = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.7, 5.2, 0.7), sandstone);
      shaft.position.y = 2.6;
      shaft.castShadow = true;
      g.add(shaft);
      const tip = new THREE.Mesh(
        new THREE.ConeGeometry(0.55, 0.8, 4),
        new THREE.MeshStandardMaterial({ color: 0xd8a832, roughness: 0.3, metalness: 0.9 }),
      );
      tip.position.y = 5.5;
      tip.rotation.y = Math.PI / 4;
      g.add(tip);
      const glyphMat = new THREE.MeshBasicMaterial({ color: 0xd8a832, transparent: true, opacity: 0.25 });
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 4), glyphMat);
      strip.position.set(0, 2.6, 0.36);
      g.add(strip);
      g.position.set(x, -0.2, z);
      this.env.add(g);
      this.obeliskGlyphs.push(glyphMat);
    };
    mkObelisk(-6.4, -6.4);
    mkObelisk(6.4, -6.4);
    mkObelisk(-6.4, 6.4);
    mkObelisk(6.4, 6.4);

    // Ruined columns.
    const colMat = sandstone.clone();
    for (const [x, z, h] of [[-11, -3, 4.5], [-11, 3, 3], [11, -3, 4], [11, 3, 5]] as [number, number, number][]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, h, 10), colMat);
      col.position.set(x, -0.3 + h / 2, z);
      col.castShadow = true;
      this.env.add(col);
    }

    // Torches.
    for (const [x, z] of [[-5.2, 0], [5.2, 0]] as [number, number][]) {
      const t = buildTorch(2.4, 0xffb040);
      t.group.position.set(x, -0.3, z);
      this.env.add(t.group);
      this.registerFlicker(new FlickerLight(t.light, { flame: t.flame }));
    }

    // Blowing sand.
    const field = new AmbientField(s, {
      mode: "sand",
      count: 240,
      bounds: new THREE.Box3(new THREE.Vector3(-14, -1.4, -14), new THREE.Vector3(14, 5, 14)),
      color: 0xe8c98a,
      size: 0.06,
      opacity: 0.4,
    });
    this.ambients.push(field);
  }

  onCheck(ev: CheckEventPayload): void {
    super.onCheck(ev);
    // Ancient symbols ignite.
    for (const m of this.obeliskGlyphs) {
      m.color.set(0xff5a1a);
      tweens.add({
        duration: 1.2,
        onUpdate: (t) => {
          m.opacity = 0.25 + Math.sin(t * Math.PI * 3) * 0.5;
        },
        onComplete: () => {
          m.opacity = 0.65;
        },
      });
    }
  }

  onCheckCleared(): void {
    super.onCheckCleared();
    for (const m of this.obeliskGlyphs) {
      m.color.set(0xd8a832);
      m.opacity = 0.25;
    }
  }

  onCheckmate(ev: CheckmateEventPayload): void {
    // Temple doors open: golden light floods the winner's half.
    this.winnerLight = new THREE.PointLight(0xffd24a, 0, 16, 1.4);
    this.winnerLight.position.set(0, 4.5, ev.winner === "w" ? 2.5 : -2.5);
    this.env.add(this.winnerLight);
    tweens.add({
      duration: 2,
      ease: Easing.quadOut,
      onUpdate: (t) => {
        if (this.winnerLight) this.winnerLight.intensity = 90 * t;
      },
    });
    for (const m of this.obeliskGlyphs) {
      m.color.set(0xffd24a);
      m.opacity = 0.9;
    }
  }

  onDraw(_ev: DrawEventPayload): void {
    tweens.add({
      duration: 2,
      onUpdate: (t) => (this.sun.intensity = 2.9 * (1 - t * 0.45)),
    });
  }
}
