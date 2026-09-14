// ---------------------------------------------------------------------------
// Samurai Battlefield theme — castle, bamboo, cherry blossoms and mist.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { ArenaTheme, CaptureStyle, ThemeMeta } from "../arena/ArenaTheme";
import { BoardPalette } from "../board/Board3D";
import { PieceMaterials } from "../pieces/Piece3D";
import { AmbientField } from "../effects/ParticleManager";
import { Easing, tweens, rand, noiseTexture } from "../three/util";
import {
  CheckmateEventPayload,
  CheckEventPayload,
  DrawEventPayload,
  MoveEventPayload,
} from "../arena/ArenaEvents";

export class SamuraiTheme extends ArenaTheme {
  private key!: THREE.DirectionalLight;
  private keyBase = 2.4;
  private lanternLights: THREE.PointLight[] = [];
  private blossoms: THREE.Mesh[] = [];
  private windBurstReady = true;

  meta(): ThemeMeta {
    return {
      id: "samurai",
      name: "SAMURAI BATTLEFIELD",
      tagline: "Silence before the strike.",
      description:
        "A mountain keep among cherry trees. The wind stops when a king is threatened; checkmate comes with a storm of blossoms.",
      preview: "linear-gradient(165deg, #2a2438 0%, #7a4a5a 38%, #e8a0b0 70%, #3a3030 100%)",
      accent: "#f0a8b8",
    };
  }

  palette(): BoardPalette {
    return {
      lightSquare: 0xe3d3b3,
      darkSquare: 0x4a3226,
      squareRoughness: 0.35,
      squareMetalness: 0.1,
      frame: 0x241a12,
      frameRoughness: 0.3,
      frameMetalness: 0.15,
      selection: 0xf0a8b8,
      legalDot: 0xf5c9a0,
      captureRing: 0xd94a3a,
      lastMove: 0xf5dcb8,
      check: 0xd92632,
    };
  }

  pieceMaterials(): PieceMaterials {
    return {
      white: new THREE.MeshStandardMaterial({
        color: 0xf2e6d0,
        roughness: 0.28,
        metalness: 0.12,
        emissive: 0x000000,
      }),
      black: new THREE.MeshStandardMaterial({
        color: 0x20161a,
        roughness: 0.3,
        metalness: 0.35,
        emissive: 0x300a0a,
        emissiveIntensity: 0.15,
      }),
    };
  }

  captureStyle(): CaptureStyle {
    return {
      mode: "topple",
      duration: 0.95,
      spin: 4.2,
      fade: false,
      burst: { color: 0xf0a8b8, color2: 0xffffff, count: 26, speed: 2.4, gravity: -3, size: 0.13 },
    };
  }

  build(): void {
    const s = this.ctx.scene;
    s.fog = new THREE.Fog(0xc8b0b8, 24, 85);
    this.sky("#4a3a5a", "#d8a0a8", "#7a6a68");

    this.hemi(0xe8d0d8, 0x3a3028, 0.8);
    this.key = this.keyLight(0xffe8d0, this.keyBase, new THREE.Vector3(8, 13, -6));

    // Ground: mossy stone.
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(85, 28),
      new THREE.MeshStandardMaterial({
        color: 0x5a6250,
        roughness: 1,
        map: noiseTexture("#5a6250", "#48503f", 700, 0.3),
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -3.2;
    ground.receiveShadow = true;
    this.env.add(ground);

    // Lacquered wooden platform.
    const wood = new THREE.MeshStandardMaterial({
      color: 0x3c2a1e,
      roughness: 0.35,
      metalness: 0.1,
      map: noiseTexture("#3c2a1e", "#2c1e14", 400, 0.2),
    });
    this.platform(wood, 13.8, 1.2, -0.85);
    const tatami = new THREE.Mesh(new THREE.BoxGeometry(10.9, 0.1, 10.9), wood);
    tatami.position.y = -0.27;
    tatami.receiveShadow = true;
    this.env.add(tatami);

    // Japanese castle in the distance.
    const castle = new THREE.Group();
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xe8e2d8, roughness: 0.8 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x2a3038, roughness: 0.7 });
    const mkTier = (w: number, h: number, y: number) => {
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), wallMat);
      body.position.y = y + h / 2;
      castle.add(body);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.85, 1.4, 4), roofMat);
      roof.position.y = y + h + 0.6;
      roof.rotation.y = Math.PI / 4;
      castle.add(roof);
    };
    mkTier(7, 3.4, 0);
    mkTier(5.4, 2.8, 4.4);
    mkTier(3.8, 2.4, 8);
    castle.position.set(-24, -3.2, -30);
    this.env.add(castle);

    // Stone lanterns with warm lights.
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8a8a86, roughness: 0.95 });
    for (const [x, z] of [[-5.4, -5.4], [5.4, -5.4], [-5.4, 5.4], [5.4, 5.4]] as [number, number][]) {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), stoneMat);
      base.position.y = 0.2;
      g.add(base);
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.9, 8), stoneMat);
      pillar.position.y = 0.85;
      g.add(pillar);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.34, 0.44), stoneMat);
      lamp.position.y = 1.45;
      g.add(lamp);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.3, 4), stoneMat);
      cap.position.y = 1.75;
      cap.rotation.y = Math.PI / 4;
      g.add(cap);
      const light = new THREE.PointLight(0xffb060, 5, 7, 1.8);
      light.position.y = 1.45;
      g.add(light);
      this.lanternLights.push(light);
      g.position.set(x, -0.25, z);
      g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
      this.env.add(g);
    }

    // Cherry trees.
    const mkTree = (x: number, z: number, scale: number) => {
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22 * scale, 0.34 * scale, 3 * scale, 7),
        new THREE.MeshStandardMaterial({ color: 0x4a3226, roughness: 0.9 }),
      );
      trunk.position.y = 1.5 * scale;
      trunk.castShadow = true;
      g.add(trunk);
      for (let i = 0; i < 4; i++) {
        const blob = new THREE.Mesh(
          new THREE.SphereGeometry(rand(1, 1.6) * scale, 8, 6),
          new THREE.MeshStandardMaterial({ color: 0xf0a8b8, roughness: 0.9, flatShading: true }),
        );
        blob.position.set(rand(-1, 1) * scale, (2.8 + rand(0, 1.4)) * scale, rand(-1, 1) * scale);
        blob.castShadow = true;
        g.add(blob);
        this.blossoms.push(blob);
      }
      g.position.set(x, -3.2, z);
      this.env.add(g);
    };
    mkTree(-9.5, 7.5, 1.1);
    mkTree(10, -6.5, 1.3);
    mkTree(8.5, 8.5, 0.9);
    mkTree(-11, -7, 1);

    // Bamboo grove.
    const bambooMat = new THREE.MeshStandardMaterial({ color: 0x5a7a3a, roughness: 0.8 });
    for (let i = 0; i < 12; i++) {
      const h = rand(4, 7);
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, h, 6), bambooMat);
      const ang = rand(0, Math.PI * 2);
      const dist = rand(13, 19);
      stalk.position.set(Math.cos(ang) * dist, -3.2 + h / 2, Math.sin(ang) * dist);
      stalk.rotation.z = rand(-0.06, 0.06);
      this.env.add(stalk);
    }

    // Falling petals.
    const field = new AmbientField(s, {
      mode: "petals",
      count: 240,
      bounds: new THREE.Box3(new THREE.Vector3(-13, -1, -13), new THREE.Vector3(13, 10, 13)),
      color: 0xf5b8c8,
      color2: 0xffffff,
      size: 0.09,
      opacity: 0.8,
    });
    this.ambients.push(field);
  }

  onMove(ev: MoveEventPayload): void {
    // Subtle wind puff.
    const to = this.squarePos(ev.move.to, 0.1);
    this.ctx.particles.burst({
      position: to,
      count: 7,
      color: 0xf0d8c8,
      speed: 0.9,
      gravity: 0.2,
      life: 0.6,
      size: 0.08,
      spread: 0.3,
      direction: new THREE.Vector3(0, 1, 0),
      coneSpread: 1,
    });
  }

  onCheck(ev: CheckEventPayload): void {
    super.onCheck(ev);
    // The world goes quiet: light drops, lanterns dim — then the red ring.
    tweens.add({
      duration: 1.4,
      ease: Easing.quadInOut,
      onUpdate: (t) => {
        this.key.intensity = this.keyBase * (1 - 0.35 * Math.sin(t * Math.PI));
        for (const l of this.lanternLights) l.intensity = 5 * (1 - 0.6 * Math.sin(t * Math.PI));
      },
      onComplete: () => {
        this.key.intensity = this.keyBase;
        for (const l of this.lanternLights) l.intensity = 5;
      },
    });
  }

  onCheckmate(ev: CheckmateEventPayload): void {
    // A storm of blossoms sweeps the battlefield.
    const dir = ev.winner === "w" ? new THREE.Vector3(-1, 0.4, 0.2) : new THREE.Vector3(1, 0.4, -0.2);
    for (let i = 0; i < 8; i++) {
      this.ctx.particles.burst({
        position: new THREE.Vector3(rand(-4, 4), rand(0.5, 4), rand(-4, 4)),
        count: 24,
        color: 0xf5b8c8,
        color2: 0xffffff,
        speed: 2.8,
        gravity: -1.2,
        life: 1.8,
        size: 0.14,
        direction: dir,
        coneSpread: 0.7,
      });
    }
    tweens.add({
      duration: 2.4,
      ease: Easing.quadInOut,
      onUpdate: (t) => {
        this.key.intensity = this.keyBase * (1 + 0.5 * Math.sin(t * Math.PI));
      },
    });
  }

  onDraw(_ev: DrawEventPayload): void {
    tweens.add({
      duration: 2,
      onUpdate: (t) => (this.key.intensity = this.keyBase * (1 - t * 0.4)),
    });
  }
}
