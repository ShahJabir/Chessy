// ---------------------------------------------------------------------------
// Cyberpunk Neon City theme — black glass, neon edges, rain and holograms.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { ArenaTheme, CaptureStyle, ThemeMeta } from "../arena/ArenaTheme";
import { BoardPalette } from "../board/Board3D";
import { PieceMaterials } from "../pieces/Piece3D";
import { AmbientField } from "../effects/ParticleManager";
import { buildSkyscraper } from "./common";
import { Easing, tweens, rand, canvasTexture } from "../three/util";
import {
  CheckmateEventPayload,
  CastleEventPayload,
  DrawEventPayload,
  MoveEventPayload,
  CheckEventPayload,
} from "../arena/ArenaEvents";

export class CyberpunkTheme extends ArenaTheme {
  private vehicles: { mesh: THREE.Mesh; r: number; speed: number; y: number; phase: number }[] = [];
  private holoMats: THREE.MeshBasicMaterial[] = [];
  private key!: THREE.DirectionalLight;
  private winnerLight: THREE.PointLight | null = null;
  private shutdown = false;

  meta(): ThemeMeta {
    return {
      id: "cyberpunk",
      name: "CYBERPUNK NEON CITY",
      tagline: "Rain on black glass.",
      description:
        "A rooftop arena above a megacity. Pieces cut trails of light, captures dissolve into data, and checkmate triggers a system override.",
      preview: "linear-gradient(165deg, #05060f 0%, #12123a 35%, #b0267a 75%, #00e5ff 110%)",
      accent: "#00e5ff",
    };
  }

  palette(): BoardPalette {
    return {
      lightSquare: 0x223047,
      darkSquare: 0x0c111e,
      squareRoughness: 0.22,
      squareMetalness: 0.75,
      frame: 0x05070d,
      frameRoughness: 0.3,
      frameMetalness: 0.8,
      selection: 0x00e5ff,
      legalDot: 0x00e5ff,
      captureRing: 0xff2d78,
      lastMove: 0x2ef3ff,
      check: 0xff2038,
    };
  }

  pieceMaterials(): PieceMaterials {
    return {
      white: new THREE.MeshStandardMaterial({
        color: 0xe8f6ff,
        roughness: 0.22,
        metalness: 0.4,
        emissive: 0x37e6ff,
        emissiveIntensity: 0.22,
      }),
      black: new THREE.MeshStandardMaterial({
        color: 0x15161d,
        roughness: 0.3,
        metalness: 0.85,
        emissive: 0xff2d78,
        emissiveIntensity: 0.12,
      }),
    };
  }

  captureStyle(): CaptureStyle {
    return {
      mode: "sink",
      duration: 0.9,
      spin: 2.4,
      fade: true,
      burst: {
        color: 0x00e5ff,
        color2: 0xff2d78,
        count: 36,
        speed: 3.2,
        gravity: 1.5,
        size: 0.13,
        additive: true,
      },
    };
  }

  build(): void {
    const s = this.ctx.scene;
    s.fog = new THREE.Fog(0x070a16, 24, 80);
    this.sky("#04040c", "#181a3f", "#3d1030");

    this.hemi(0x2a3560, 0x0a0614, 0.55);
    this.key = this.keyLight(0x8fb7ff, 1.5, new THREE.Vector3(-8, 15, 5));
    const magenta = new THREE.PointLight(0xff2d78, 30, 30, 1.6);
    magenta.position.set(6, 3.5, -6);
    this.env.add(magenta);
    const cyan = new THREE.PointLight(0x00e5ff, 26, 30, 1.6);
    cyan.position.set(-6, 3.5, 6);
    this.env.add(cyan);

    // Rooftop platform with neon edge.
    const plat = this.platform(
      new THREE.MeshStandardMaterial({ color: 0x0a0d18, roughness: 0.25, metalness: 0.8 }),
      14, 1.3, -0.9,
    );
    plat.receiveShadow = true;
    const edge = new THREE.Mesh(
      new THREE.BoxGeometry(14.2, 0.08, 14.2),
      new THREE.MeshBasicMaterial({ color: 0x00e5ff }),
    );
    edge.position.y = -0.28;
    this.env.add(edge);

    // Glowing floor grid around the platform.
    const gridTex = canvasTexture(256, (ctx, sz) => {
      ctx.fillStyle = "#04060c";
      ctx.fillRect(0, 0, sz, sz);
      ctx.strokeStyle = "rgba(0,229,255,0.55)";
      ctx.lineWidth = 2;
      for (let i = 0; i <= 8; i++) {
        const p = (i / 8) * sz;
        ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, sz); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(sz, p); ctx.stroke();
      }
    });
    gridTex.wrapS = gridTex.wrapT = THREE.RepeatWrapping;
    gridTex.repeat.set(6, 6);
    const gridMat = new THREE.MeshStandardMaterial({
      color: 0x0a0e18,
      roughness: 0.35,
      metalness: 0.6,
      emissive: 0xffffff,
      emissiveMap: gridTex,
      emissiveIntensity: 0.35,
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), gridMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -6;
    this.env.add(ground);

    // Skyline.
    const neonColors = [0x00e5ff, 0xff2d78, 0xffb300, 0x7c4dff];
    for (let i = 0; i < 26; i++) {
      const ang = (i / 26) * Math.PI * 2 + rand(-0.08, 0.08);
      const dist = rand(26, 52);
      const w = rand(3, 7);
      const h = rand(9, 26);
      const b = buildSkyscraper(w, h, w, 0x0c0f1a, neonColors[i % neonColors.length]);
      b.position.set(Math.cos(ang) * dist, -6 + h / 2 - rand(0, 4), Math.sin(ang) * dist);
      b.rotation.y = rand(0, Math.PI);
      this.env.add(b);
    }

    // Holographic billboards.
    const mkHolo = (text: string, color: string, x: number, y: number, z: number, rotY: number) => {
      const tex = canvasTexture(256, (ctx, sz) => {
        ctx.clearRect(0, 0, sz, sz);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.16;
        ctx.fillRect(0, 0, sz, sz);
        ctx.globalAlpha = 1;
        ctx.font = "bold 34px monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = color;
        ctx.fillText(text, sz / 2, sz / 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.strokeRect(8, 8, sz - 16, sz - 16);
      });
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), mat);
      m.position.set(x, y, z);
      m.rotation.y = rotY;
      this.env.add(m);
      this.holoMats.push(mat);
      this.disposables.push(tex);
    };
    mkHolo("CHESS//ARENA", "#00e5ff", -14, 6, -14, 0.7);
    mkHolo("NEON 将棋", "#ff2d78", 15, 8, -10, -0.8);
    mkHolo("SYSTEM ONLINE", "#ffb300", 12, 5, 13, -2.4);

    // Flying vehicles.
    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.14, 0.9),
        new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff2d78 : 0x00e5ff }),
      );
      this.env.add(mesh);
      this.vehicles.push({ mesh, r: rand(18, 34), speed: rand(0.2, 0.5), y: rand(6, 14), phase: rand(0, 6) });
    }

    // Rain.
    const rain = new AmbientField(s, {
      mode: "rain",
      count: 500,
      bounds: new THREE.Box3(new THREE.Vector3(-16, -2, -16), new THREE.Vector3(16, 18, 16)),
      color: 0x9fd8ff,
      size: 0.05,
      opacity: 0.5,
    });
    this.ambients.push(rain);
  }

  onMove(ev: MoveEventPayload): void {
    // Light trail burst.
    const from = this.squarePos(ev.move.from, 0.4);
    const to = this.squarePos(ev.move.to, 0.4);
    const steps = 3;
    for (let i = 0; i <= steps; i++) {
      const p = from.clone().lerp(to, i / steps);
      this.ctx.particles.burst({
        position: p,
        count: 4,
        color: 0x00e5ff,
        color2: 0xffffff,
        speed: 0.6,
        gravity: 0.4,
        life: 0.45,
        size: 0.1,
        additive: true,
        spread: 0.1,
        direction: new THREE.Vector3(0, 1, 0),
        coneSpread: 0.6,
      });
    }
  }

  onCheck(ev: CheckEventPayload): void {
    super.onCheck(ev);
    // Red security sweep: holograms flicker.
    tweens.add({
      duration: 1.6,
      onUpdate: (t) => {
        for (const m of this.holoMats) {
          m.color.set(Math.sin(t * 40) > 0 ? 0xff2038 : 0xffffff);
        }
      },
      onComplete: () => this.holoMats.forEach((m) => m.color.set(0xffffff)),
    });
  }

  onCastle(_ev: CastleEventPayload): void {
    // Defensive system activates: shield ring pulse.
    const pos = this.squarePos(_ev.move.to, 0.2);
    this.ctx.particles.burst({
      position: pos,
      count: 50,
      color: 0x00e5ff,
      speed: 3.4,
      gravity: 0,
      life: 0.7,
      size: 0.12,
      additive: true,
      direction: new THREE.Vector3(0, 1, 0),
      coneSpread: 1.6,
    });
  }

  onCheckmate(ev: CheckmateEventPayload): void {
    // SYSTEM OVERRIDE: the city brown-outs, then the winner's half glows.
    this.shutdown = true;
    const key = this.key;
    tweens.add({
      duration: 1.8,
      ease: Easing.quadInOut,
      onUpdate: (t) => {
        key.intensity = 1.5 * (1 - t * 0.75) * (Math.sin(t * 60) > -0.6 ? 1 : 0.2);
      },
      onComplete: () => (key.intensity = 0.5),
    });
    this.winnerLight = new THREE.PointLight(ev.winner === "w" ? 0x00e5ff : 0xff2d78, 0, 12, 1.6);
    this.winnerLight.position.set(0, 3.5, ev.winner === "w" ? 2.5 : -2.5);
    this.env.add(this.winnerLight);
    tweens.add({
      duration: 1.5,
      ease: Easing.quadOut,
      onUpdate: (t) => {
        if (this.winnerLight) this.winnerLight.intensity = 60 * t;
      },
    });
  }

  onDraw(_ev: DrawEventPayload): void {
    tweens.add({
      duration: 2,
      onUpdate: (t) => (this.key.intensity = 1.5 * (1 - t * 0.4)),
    });
  }

  update(dt: number): void {
    super.update(dt);
    for (const v of this.vehicles) {
      v.phase += dt * v.speed;
      v.mesh.position.set(Math.cos(v.phase) * v.r, v.y, Math.sin(v.phase) * v.r);
      v.mesh.rotation.y = -v.phase + Math.PI / 2;
    }
    if (!this.shutdown) {
      for (const m of this.holoMats) {
        m.opacity = 0.7 + Math.sin(this.time * 13 + m.id) * 0.12 + (Math.random() < 0.004 ? -0.3 : 0);
      }
    }
  }
}
