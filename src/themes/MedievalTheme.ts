// ---------------------------------------------------------------------------
// Medieval Castle theme — the flagship arena.
// Stone courtyard, towers, banners, torches, mountains and mist.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { ArenaTheme, CaptureStyle, ThemeMeta } from "../arena/ArenaTheme";
import { BoardPalette } from "../board/Board3D";
import { PieceMaterials } from "../pieces/Piece3D";
import { AmbientField } from "../effects/ParticleManager";
import { FlickerLight } from "../effects/LightingEffects";
import {
  buildBanner,
  buildMountain,
  buildTorch,
  buildTower,
  stoneMaterial,
  woodMaterial,
} from "./common";
import { Easing, tweens, rand } from "../three/util";
import { CheckEventPayload, CheckmateEventPayload, CastleEventPayload, DrawEventPayload, MoveEventPayload } from "../arena/ArenaEvents";

export class MedievalTheme extends ArenaTheme {
  private banners: THREE.Group[] = [];
  private clouds: THREE.Mesh[] = [];
  private torches: { flicker: FlickerLight; flame: THREE.Mesh; light: THREE.PointLight }[] = [];
  private victoryBanners: THREE.Group[] = [];
  private sun!: THREE.DirectionalLight;
  private sunBaseIntensity = 2.6;
  private checkActive = false;

  meta(): ThemeMeta {
    return {
      id: "medieval",
      name: "MEDIEVAL CASTLE",
      tagline: "Stone, steel and torchlight.",
      description:
        "A castle courtyard high in the mountains. Torches flare red when a king is threatened, and the gates open for the victor.",
      preview: "linear-gradient(160deg, #2b3550 0%, #4a5a7a 40%, #8a6f4a 75%, #3c2f22 100%)",
      accent: "#e0b25a",
    };
  }

  palette(): BoardPalette {
    return {
      lightSquare: 0xd9c9a3,
      darkSquare: 0x5e4630,
      squareRoughness: 0.6,
      squareMetalness: 0.06,
      frame: 0x33241a,
      frameRoughness: 0.55,
      frameMetalness: 0.18,
      selection: 0xf5c94f,
      legalDot: 0xf0c95c,
      captureRing: 0xe0653a,
      lastMove: 0xf7e6a8,
      check: 0xff3b30,
    };
  }

  pieceMaterials(): PieceMaterials {
    return {
      white: new THREE.MeshStandardMaterial({
        color: 0xf0e6cf,
        roughness: 0.34,
        metalness: 0.08,
        emissive: 0x000000,
      }),
      black: new THREE.MeshStandardMaterial({
        color: 0x27272e,
        roughness: 0.38,
        metalness: 0.62,
        emissive: 0x000000,
      }),
    };
  }

  captureStyle(): CaptureStyle {
    return {
      mode: "topple",
      duration: 1.15,
      spin: 3.4,
      fade: false,
      burst: { color: 0x9b8a68, color2: 0x5e4630, count: 30, speed: 2.8, gravity: -9, size: 0.15 },
    };
  }

  build(): void {
    const s = this.ctx.scene;
    s.fog = new THREE.Fog(0x8fa1b8, 26, 88);

    this.sky("#3f5173", "#a8b6c8", "#5b5348");
    this.hemi(0xbdd0e8, 0x4a4237, 0.75);
    this.sun = this.keyLight(0xffe0b0, this.sunBaseIntensity, new THREE.Vector3(9, 14, 6));

    // Ground far below the courtyard.
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(80, 28),
      new THREE.MeshStandardMaterial({ color: 0x4a5238, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -8;
    this.env.add(ground);

    // Courtyard platform.
    this.platform(stoneMaterial(0x84796a), 14.4, 1.35, -0.95);
    const apron = new THREE.Mesh(new THREE.BoxGeometry(17.5, 0.7, 17.5), stoneMaterial(0x766c5e));
    apron.position.y = -2;
    apron.receiveShadow = true;
    this.env.add(apron);
    // Wooden deck ring around the board.
    const deck = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.22, 11.4), woodMaterial(0x6e4f33));
    deck.position.y = -0.28;
    deck.receiveShadow = true;
    this.env.add(deck);

    // Walls + towers.
    const wallMat = stoneMaterial(0x8a8072);
    const mkWall = (x: number, z: number, rotY: number, len = 12) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(len, 3.4, 0.9), wallMat);
      wall.position.set(x, 0.6, z);
      wall.rotation.y = rotY;
      wall.castShadow = true;
      wall.receiveShadow = true;
      this.env.add(wall);
      // Merlons.
      for (let i = -3; i <= 3; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 1), wallMat);
        m.position.set(x + Math.cos(rotY) * i * 1.6, 2.55, z - Math.sin(rotY) * i * 1.6);
        m.rotation.y = rotY;
        this.env.add(m);
      }
    };
    mkWall(0, -7.6, 0);
    mkWall(-7.6, 0, Math.PI / 2);
    mkWall(7.6, 0, Math.PI / 2);
    // South wall split for the gate.
    const gateL = new THREE.Mesh(new THREE.BoxGeometry(4.4, 3.4, 0.9), wallMat);
    gateL.position.set(-4.4, 0.6, 7.6);
    const gateR = gateL.clone();
    gateR.position.x = 4.4;
    this.env.add(gateL, gateR);
    const gateArch = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1, 0.9), wallMat);
    gateArch.position.set(0, 2.9, 7.6);
    this.env.add(gateArch);

    const towerPositions: [number, number][] = [
      [-7.6, -7.6], [7.6, -7.6], [-7.6, 7.6], [7.6, 7.6],
    ];
    towerPositions.forEach(([x, z], i) => {
      const { group } = buildTower(1.35, 5.6 + (i % 2) * 0.7, 0x877d6e, 0x5c2e2e);
      group.position.set(x, -0.3, z);
      this.env.add(group);
      const banner = buildBanner(i % 2 === 0 ? 0xa03030 : 0x34508c);
      banner.position.set(x, 7.4 + (i % 2) * 0.7, z);
      this.env.add(banner);
      this.banners.push(banner);
    });

    // Hidden victory banners (revealed at checkmate).
    for (const [x, z] of towerPositions) {
      const vb = buildBanner(0xd8af3c, 1.0, 2.2);
      vb.position.set(x * 0.82, 6.4, z * 0.82);
      vb.scale.setScalar(0.001);
      this.env.add(vb);
      this.victoryBanners.push(vb);
    }

    // Torches near the board.
    const torchSpots: [number, number][] = [
      [-5.2, -5.2], [5.2, -5.2], [-5.2, 5.2], [5.2, 5.2],
    ];
    for (const [x, z] of torchSpots) {
      const t = buildTorch(2.3);
      t.group.position.set(x, -0.25, z);
      this.env.add(t.group);
      const flicker = this.registerFlicker(new FlickerLight(t.light, { flame: t.flame }));
      this.torches.push({ flicker, flame: t.flame, light: t.light });
    }

    // Mountains + clouds.
    const mountColors = [0x5d6a7c, 0x515d6e, 0x67788c];
    const mounts: [number, number, number, number][] = [
      [-30, -34, 16, 18], [24, -38, 20, 24], [-14, -44, 22, 26], [40, -20, 14, 15], [-42, -12, 15, 17],
    ];
    mounts.forEach(([x, z, r, h], i) => {
      const m = buildMountain(r, h, mountColors[i % mountColors.length]);
      m.position.set(x, -8, z);
      this.env.add(m);
    });

    const cloudMat = new THREE.MeshBasicMaterial({
      color: 0xdfe7f2,
      transparent: true,
      opacity: 0.55,
      fog: false,
      depthWrite: false,
    });
    for (let i = 0; i < 6; i++) {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(rand(10, 20), rand(3, 5)), cloudMat);
      c.position.set(rand(-45, 45), rand(12, 24), rand(-55, -25));
      c.rotation.x = -0.2;
      this.env.add(c);
      this.clouds.push(c);
    }

    // Ambient drifting motes (dust / mist).
    const field = new AmbientField(s, {
      mode: "motes",
      count: 160,
      bounds: new THREE.Box3(new THREE.Vector3(-10, -1, -10), new THREE.Vector3(10, 8, 10)),
      color: 0xdfe7ef,
      size: 0.055,
      opacity: 0.35,
    });
    this.ambients.push(field);
  }

  // ------------------------------------------------------------ events

  onMove(ev: MoveEventPayload): void {
    const pos = this.squarePos(ev.move.to, 0.06);
    this.ctx.particles.burst({
      position: pos,
      count: 9,
      color: 0xb9a67f,
      color2: 0x8d7a55,
      speed: 1.2,
      gravity: -1.2,
      life: 0.55,
      size: 0.09,
      spread: 0.3,
      direction: new THREE.Vector3(0, 1, 0),
      coneSpread: 0.9,
    });
  }

  onCheck(ev: CheckEventPayload): void {
    super.onCheck(ev);
    this.checkActive = true;
    for (const t of this.torches) {
      t.light.color.set(0xff2211);
      t.flicker.setFlameColor(0xff3318);
    }
  }

  onCheckCleared(): void {
    super.onCheckCleared();
    this.checkActive = false;
    for (const t of this.torches) {
      t.light.color.set(0xff9a3c);
      t.flicker.setFlameColor(0xff9a3c);
    }
  }

  onCastle(_ev: CastleEventPayload): void {
    // Torches flare gold: defensive systems of the castle acknowledge it.
    for (const t of this.torches) {
      t.light.color.set(0xffd76a);
      const flicker = t.flicker;
      tweens.add({
        duration: 1.4,
        ease: Easing.quadInOut,
        onUpdate: (v) => {
          if (this.checkActive) return;
          const c = new THREE.Color(0xffd76a).lerp(new THREE.Color(0xff9a3c), v);
          t.light.color.copy(c);
          flicker.setFlameColor(c.getHex());
        },
      });
    }
  }

  onCheckmate(ev: CheckmateEventPayload): void {
    // Victory banners unfurl; torches burn gold; sparks over the winner's half.
    for (const vb of this.victoryBanners) {
      tweens.add({
        duration: 1.6,
        ease: Easing.backOut,
        onUpdate: (t) => vb.scale.setScalar(Math.max(0.001, t)),
      });
    }
    for (const t of this.torches) {
      t.light.color.set(0xffd76a);
      t.flicker.setFlameColor(0xffd76a);
      t.flicker.setBaseIntensity(t.light.intensity * 1.6);
    }
    const winnerZ = ev.winner === "w" ? 2 : -2;
    for (let i = 0; i < 5; i++) {
      this.ctx.particles.burst({
        position: new THREE.Vector3(rand(-3, 3), rand(0.5, 2.5), winnerZ + rand(-1.5, 1.5)),
        count: 26,
        color: 0xffd76a,
        color2: 0xfff3c0,
        speed: 3.2,
        gravity: -2.5,
        life: 1.4,
        size: 0.16,
        additive: true,
        direction: new THREE.Vector3(0, 1, 0),
        coneSpread: 0.9,
      });
    }
  }

  onDraw(_ev: DrawEventPayload): void {
    // The battlefield settles into a neutral dusk.
    tweens.add({
      duration: 2,
      ease: Easing.quadOut,
      onUpdate: (t) => {
        this.sun.intensity = this.sunBaseIntensity * (1 - 0.45 * t);
      },
    });
    this.victoryBanners.forEach((vb) => vb.scale.setScalar(0.001));
  }

  update(dt: number): void {
    super.update(dt);
    // Banners sway in the wind.
    for (let i = 0; i < this.banners.length; i++) {
      this.banners[i].rotation.y = Math.sin(this.time * 0.9 + i * 1.7) * 0.25;
    }
    for (let i = 0; i < this.victoryBanners.length; i++) {
      if (this.victoryBanners[i].scale.x > 0.5) {
        this.victoryBanners[i].rotation.y = Math.sin(this.time * 1.1 + i) * 0.2;
      }
    }
    // Clouds drift.
    for (const c of this.clouds) {
      c.position.x += dt * 0.35;
      if (c.position.x > 55) c.position.x = -55;
    }
  }
}
