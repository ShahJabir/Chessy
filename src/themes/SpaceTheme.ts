// ---------------------------------------------------------------------------
// Space Void Arena theme — a platform drifting among stars and nebulae.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { ArenaTheme, CaptureStyle, ThemeMeta } from "../arena/ArenaTheme";
import { BoardPalette } from "../board/Board3D";
import { PieceMaterials } from "../pieces/Piece3D";
import { AmbientField } from "../effects/ParticleManager";
import { buildRock } from "./common";
import { Easing, tweens, rand } from "../three/util";
import {
  CheckmateEventPayload,
  CastleEventPayload,
  DrawEventPayload,
  MoveEventPayload,
} from "../arena/ArenaEvents";

export class SpaceTheme extends ArenaTheme {
  private asteroids: THREE.Mesh[] = [];
  private stars: THREE.Points | null = null;
  private key!: THREE.DirectionalLight;
  private holo!: THREE.HemisphereLight;
  private edgeMat!: THREE.MeshBasicMaterial;
  private winnerLight: THREE.PointLight | null = null;

  meta(): ThemeMeta {
    return {
      id: "space",
      name: "SPACE VOID ARENA",
      tagline: "A platform at the edge of nowhere.",
      description:
        "The board floats in deep space. Pieces trail energy as they move, captured units break apart and drift into the void.",
      preview: "linear-gradient(160deg, #020208 0%, #0b1030 40%, #3b1e5e 75%, #0b4f5e 100%)",
      accent: "#7df9ff",
    };
  }

  palette(): BoardPalette {
    return {
      lightSquare: 0x9aa7bd,
      darkSquare: 0x1d2637,
      squareRoughness: 0.35,
      squareMetalness: 0.7,
      frame: 0x2c3648,
      frameRoughness: 0.4,
      frameMetalness: 0.8,
      selection: 0x7df9ff,
      legalDot: 0x7df9ff,
      captureRing: 0xffb347,
      lastMove: 0xaef4ff,
      check: 0xff3b30,
    };
  }

  pieceMaterials(): PieceMaterials {
    return {
      white: new THREE.MeshStandardMaterial({
        color: 0xdfe9f5,
        roughness: 0.28,
        metalness: 0.55,
        emissive: 0x2b6a8f,
        emissiveIntensity: 0.18,
      }),
      black: new THREE.MeshStandardMaterial({
        color: 0x1a1426,
        roughness: 0.35,
        metalness: 0.7,
        emissive: 0x5e2a8f,
        emissiveIntensity: 0.2,
      }),
    };
  }

  captureStyle(): CaptureStyle {
    return {
      mode: "float",
      duration: 1.6,
      spin: 1.8,
      fade: true,
      burst: {
        color: 0x9fd8ff,
        color2: 0x5e2a8f,
        count: 30,
        speed: 1.8,
        gravity: 0,
        size: 0.14,
        additive: true,
      },
    };
  }

  build(): void {
    const s = this.ctx.scene;
    s.fog = null;
    this.sky("#010104", "#0a0c22", "#05030f", 140);

    // Star field.
    const starGeo = new THREE.BufferGeometry();
    const starCount = 1400;
    const pos = new Float32Array(starCount * 3);
    const col = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = rand(60, 130);
      const theta = rand(0, Math.PI * 2);
      const phi = Math.acos(rand(-1, 1));
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.cos(phi);
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      const tint = Math.random();
      col[i * 3] = 0.7 + tint * 0.3;
      col[i * 3 + 1] = 0.75 + tint * 0.25;
      col[i * 3 + 2] = 0.9 + tint * 0.1;
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    starGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const starMat = new THREE.PointsMaterial({
      size: 0.55,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      fog: false,
      depthWrite: false,
    });
    this.stars = new THREE.Points(starGeo, starMat);
    this.env.add(this.stars);

    // Nebula sprites.
    const nebulaColors = [0x3b1e5e, 0x0b4f5e, 0x5e2a8f];
    for (let i = 0; i < 5; i++) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 128;
      const ctx = canvas.getContext("2d")!;
      const c = new THREE.Color(nebulaColors[i % nebulaColors.length]);
      const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
      g.addColorStop(0, `rgba(${c.r * 255 | 0},${c.g * 255 | 0},${c.b * 255 | 0},0.55)`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
      const tex = new THREE.CanvasTexture(canvas);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.5, fog: false, depthWrite: false });
      const sp = new THREE.Sprite(mat);
      sp.position.set(rand(-70, 70), rand(-20, 50), rand(-110, -60));
      sp.scale.setScalar(rand(30, 70));
      this.env.add(sp);
      this.disposables.push(tex);
    }

    // Lights.
    this.holo = this.hemi(0x33415e, 0x05060c, 0.5);
    this.key = this.keyLight(0xcfe4ff, 2.2, new THREE.Vector3(6, 16, 8));
    const rim = new THREE.DirectionalLight(0x5e2a8f, 0.8);
    rim.position.set(-10, 6, -8);
    this.env.add(rim);

    // Floating platform: metallic disc + glowing edge.
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(7.8, 8.6, 1.1, 28),
      new THREE.MeshStandardMaterial({ color: 0x39455c, roughness: 0.4, metalness: 0.85 }),
    );
    disc.position.y = -1.1;
    disc.receiveShadow = true;
    this.env.add(disc);
    this.edgeMat = new THREE.MeshBasicMaterial({ color: 0x7df9ff });
    const edge = new THREE.Mesh(new THREE.TorusGeometry(8.2, 0.07, 8, 48), this.edgeMat);
    edge.rotation.x = Math.PI / 2;
    edge.position.y = -0.62;
    this.env.add(edge);
    // Support pylons underneath.
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      const pylon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.45, 2.6, 8),
        new THREE.MeshStandardMaterial({ color: 0x2c3648, roughness: 0.5, metalness: 0.8 }),
      );
      pylon.position.set(Math.cos(a) * 6, -2.6, Math.sin(a) * 6);
      pylon.rotation.z = Math.cos(a) * 0.16;
      pylon.rotation.x = -Math.sin(a) * 0.16;
      this.env.add(pylon);
    }

    // Planets.
    const planet1 = new THREE.Mesh(
      new THREE.SphereGeometry(9, 24, 18),
      new THREE.MeshStandardMaterial({ color: 0xc46a3a, roughness: 0.9 }),
    );
    planet1.position.set(-46, 14, -60);
    this.env.add(planet1);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(13, 1.4, 2, 40),
      new THREE.MeshStandardMaterial({ color: 0x8a7a5c, roughness: 0.8, transparent: true, opacity: 0.7 }),
    );
    ring.position.copy(planet1.position);
    ring.rotation.x = 1.9;
    this.env.add(ring);
    const planet2 = new THREE.Mesh(
      new THREE.SphereGeometry(4.5, 20, 16),
      new THREE.MeshStandardMaterial({ color: 0x4a7ec4, roughness: 0.85 }),
    );
    planet2.position.set(52, -6, -70);
    this.env.add(planet2);

    // Asteroids.
    for (let i = 0; i < 9; i++) {
      const rock = buildRock(rand(0.5, 1.6), 0x5a5f6b);
      const ang = rand(0, Math.PI * 2);
      const dist = rand(14, 30);
      rock.position.set(Math.cos(ang) * dist, rand(-6, 10), Math.sin(ang) * dist);
      rock.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
      this.env.add(rock);
      this.asteroids.push(rock);
    }

    // Drifting dust.
    const field = new AmbientField(s, {
      mode: "motes",
      count: 180,
      bounds: new THREE.Box3(new THREE.Vector3(-12, -3, -12), new THREE.Vector3(12, 10, 12)),
      color: 0x9fd8ff,
      size: 0.05,
      opacity: 0.5,
      additive: true,
    });
    this.ambients.push(field);
  }

  onMove(ev: MoveEventPayload): void {
    const to = this.squarePos(ev.move.to, 0.3);
    this.ctx.particles.burst({
      position: to,
      count: 12,
      color: ev.move.color === "w" ? 0x7df9ff : 0xb47dff,
      speed: 1.4,
      gravity: -0.4,
      life: 0.6,
      size: 0.1,
      additive: true,
      direction: new THREE.Vector3(0, 1, 0),
      coneSpread: 0.8,
    });
  }

  onCastle(ev: CastleEventPayload): void {
    // Shield system: ring of light around the king.
    const pos = this.squarePos(ev.move.to, 0.15);
    this.ctx.particles.burst({
      position: pos,
      count: 44,
      color: 0x7df9ff,
      speed: 3,
      gravity: 0,
      life: 0.8,
      size: 0.12,
      additive: true,
      direction: new THREE.Vector3(0, 1, 0),
      coneSpread: 1.7,
    });
  }

  onCheckmate(ev: CheckmateEventPayload): void {
    // Losing half powers down; winning half stays lit.
    tweens.add({
      duration: 2.2,
      ease: Easing.quadInOut,
      onUpdate: (t) => {
        this.key.intensity = 2.2 * (1 - t * 0.55);
        this.holo.intensity = 0.5 * (1 - t * 0.5);
        this.edgeMat.color.set(0x7df9ff).lerp(new THREE.Color(0xff3b30), ev.winner === "b" ? t : 0);
      },
    });
    this.winnerLight = new THREE.PointLight(ev.winner === "w" ? 0x7df9ff : 0xb47dff, 0, 14, 1.5);
    this.winnerLight.position.set(0, 4, ev.winner === "w" ? 3 : -3);
    this.env.add(this.winnerLight);
    tweens.add({
      duration: 1.6,
      ease: Easing.quadOut,
      onUpdate: (t) => {
        if (this.winnerLight) this.winnerLight.intensity = 50 * t;
      },
    });
  }

  onDraw(_ev: DrawEventPayload): void {
    tweens.add({
      duration: 2,
      onUpdate: (t) => {
        this.key.intensity = 2.2 * (1 - t * 0.4);
        this.edgeMat.color.set(0x7df9ff).lerp(new THREE.Color(0x8a8f9c), t);
      },
    });
  }

  update(dt: number): void {
    super.update(dt);
    for (let i = 0; i < this.asteroids.length; i++) {
      const a = this.asteroids[i];
      a.rotation.x += dt * 0.1 * ((i % 3) - 1 || 0.5);
      a.rotation.y += dt * 0.14;
      a.position.y += Math.sin(this.time * 0.4 + i) * 0.0015;
    }
    if (this.stars) this.stars.rotation.y += dt * 0.0035;
  }
}
