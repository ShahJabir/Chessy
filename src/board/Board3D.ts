// ---------------------------------------------------------------------------
// Board3D — the physical board: 64 squares, frame, and theme-independent
// highlight overlays (selection, legal moves, captures, last move, check).
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { Square } from "../chess/types";
import { BoardCoordinates } from "./BoardCoordinates";
import { Easing, tweens } from "../three/util";

export interface BoardPalette {
  lightSquare: THREE.ColorRepresentation;
  darkSquare: THREE.ColorRepresentation;
  squareRoughness: number;
  squareMetalness: number;
  frame: THREE.ColorRepresentation;
  frameRoughness: number;
  frameMetalness: number;
  selection: THREE.ColorRepresentation;
  legalDot: THREE.ColorRepresentation;
  captureRing: THREE.ColorRepresentation;
  lastMove: THREE.ColorRepresentation;
  check: THREE.ColorRepresentation;
}

export const DEFAULT_PALETTE: BoardPalette = {
  lightSquare: 0xd9c4a1,
  darkSquare: 0x6b4f35,
  squareRoughness: 0.62,
  squareMetalness: 0.08,
  frame: 0x3e2c1c,
  frameRoughness: 0.5,
  frameMetalness: 0.2,
  selection: 0xffd75e,
  legalDot: 0xffd75e,
  captureRing: 0xff8a3c,
  lastMove: 0xffe9a0,
  check: 0xff3b30,
};

export class Board3D {
  readonly coords: BoardCoordinates;
  readonly group: THREE.Group;
  readonly squares: THREE.Mesh[] = [];
  readonly lightMat: THREE.MeshStandardMaterial;
  readonly darkMat: THREE.MeshStandardMaterial;
  readonly frameMat: THREE.MeshStandardMaterial;

  private selectionMesh: THREE.Mesh;
  private lastMoveMeshes: THREE.Mesh[] = [];
  private checkRing: THREE.Mesh;
  private dotPool: THREE.Mesh[] = [];
  private ringPool: THREE.Mesh[] = [];
  private dotMat: THREE.MeshBasicMaterial;
  private ringMat: THREE.MeshBasicMaterial;
  private selMat: THREE.MeshBasicMaterial;
  private lastMat: THREE.MeshBasicMaterial;
  private checkMat: THREE.MeshBasicMaterial;
  private time = 0;

  constructor(coords: BoardCoordinates) {
    this.coords = coords;
    this.group = new THREE.Group();
    coords.group.add(this.group);

    this.lightMat = new THREE.MeshStandardMaterial({ color: DEFAULT_PALETTE.lightSquare });
    this.darkMat = new THREE.MeshStandardMaterial({ color: DEFAULT_PALETTE.darkSquare });
    this.frameMat = new THREE.MeshStandardMaterial({ color: DEFAULT_PALETTE.frame });

    // Squares.
    const squareGeo = new THREE.BoxGeometry(0.996, 0.18, 0.996);
    for (let i = 0; i < 64; i++) {
      const mat = coords.isLightSquare(i) ? this.lightMat : this.darkMat;
      const mesh = new THREE.Mesh(squareGeo, mat);
      const p = coords.squareToLocal(i);
      mesh.position.set(p.x, -0.09, p.z);
      mesh.receiveShadow = true;
      mesh.userData.square = i;
      mesh.name = `square-${i}`;
      this.squares.push(mesh);
      this.group.add(mesh);
    }

    // Frame.
    const frame = new THREE.Group();
    const mk = (w: number, d: number, x: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.34, d), this.frameMat);
      m.position.set(x, -0.08, z);
      m.receiveShadow = true;
      m.castShadow = true;
      frame.add(m);
    };
    // Frame hugs the outer square edges (board half-extent = 4).
    const B = 4.0;
    const th = 0.62;
    const c = B + th / 2;
    const span = 2 * (B + th);
    mk(span, th, 0, -c);
    mk(span, th, 0, c);
    mk(th, 2 * B, -c, 0);
    mk(th, 2 * B, c, 0);
    this.group.add(frame);

    // --- Highlight overlays ---------------------------------------------
    const overlayY = 0.015;
    this.selMat = new THREE.MeshBasicMaterial({
      color: DEFAULT_PALETTE.selection,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    this.selectionMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.98), this.selMat);
    this.selectionMesh.rotation.x = -Math.PI / 2;
    this.selectionMesh.position.y = overlayY;
    this.selectionMesh.visible = false;
    this.selectionMesh.renderOrder = 5;
    this.group.add(this.selectionMesh);

    this.lastMat = new THREE.MeshBasicMaterial({
      color: DEFAULT_PALETTE.lastMove,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    });
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.98), this.lastMat);
      m.rotation.x = -Math.PI / 2;
      m.position.y = overlayY - 0.004;
      m.visible = false;
      m.renderOrder = 4;
      this.lastMoveMeshes.push(m);
      this.group.add(m);
    }

    this.dotMat = new THREE.MeshBasicMaterial({
      color: DEFAULT_PALETTE.legalDot,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const dotGeo = new THREE.CircleGeometry(0.14, 20);
    for (let i = 0; i < 28; i++) {
      const dot = new THREE.Mesh(dotGeo, this.dotMat);
      dot.rotation.x = -Math.PI / 2;
      dot.position.y = overlayY;
      dot.visible = false;
      dot.renderOrder = 6;
      this.dotPool.push(dot);
      this.group.add(dot);
    }

    this.ringMat = new THREE.MeshBasicMaterial({
      color: DEFAULT_PALETTE.captureRing,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ringGeo = new THREE.RingGeometry(0.32, 0.42, 26);
    for (let i = 0; i < 12; i++) {
      const ring = new THREE.Mesh(ringGeo, this.ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = overlayY;
      ring.visible = false;
      ring.renderOrder = 6;
      this.ringPool.push(ring);
      this.group.add(ring);
    }

    this.checkMat = new THREE.MeshBasicMaterial({
      color: DEFAULT_PALETTE.check,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.checkRing = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.47, 32), this.checkMat);
    this.checkRing.rotation.x = -Math.PI / 2;
    this.checkRing.position.y = overlayY + 0.004;
    this.checkRing.visible = false;
    this.checkRing.renderOrder = 7;
    this.group.add(this.checkRing);
  }

  applyPalette(p: BoardPalette): void {
    this.lightMat.color.set(p.lightSquare);
    this.lightMat.roughness = p.squareRoughness;
    this.lightMat.metalness = p.squareMetalness;
    this.darkMat.color.set(p.darkSquare);
    this.darkMat.roughness = p.squareRoughness;
    this.darkMat.metalness = p.squareMetalness;
    this.frameMat.color.set(p.frame);
    this.frameMat.roughness = p.frameRoughness;
    this.frameMat.metalness = p.frameMetalness;
    this.selMat.color.set(p.selection);
    this.dotMat.color.set(p.legalDot);
    this.ringMat.color.set(p.captureRing);
    this.lastMat.color.set(p.lastMove);
    this.checkMat.color.set(p.check);
  }

  setSelection(square: Square | null, pulse = true): void {
    if (square === null) {
      this.selectionMesh.visible = false;
      return;
    }
    const p = this.coords.squareToLocal(square);
    this.selectionMesh.position.set(p.x, 0.015, p.z);
    this.selectionMesh.visible = true;
    if (pulse) {
      this.selectionMesh.scale.setScalar(0.6);
      tweens.add({
        duration: 0.25,
        ease: Easing.backOut,
        onUpdate: (t) => this.selectionMesh.scale.setScalar(0.6 + 0.4 * t),
      });
    }
  }

  setLegalMoves(targets: { to: Square; capture: boolean }[]): void {
    this.dotPool.forEach((d) => (d.visible = false));
    this.ringPool.forEach((r) => (r.visible = false));
    let di = 0;
    let ri = 0;
    for (const t of targets) {
      const p = this.coords.squareToLocal(t.to);
      if (t.capture) {
        const ring = this.ringPool[ri++];
        if (!ring) continue;
        ring.position.set(p.x, 0.015, p.z);
        ring.visible = true;
      } else {
        const dot = this.dotPool[di++];
        if (!dot) continue;
        dot.position.set(p.x, 0.015, p.z);
        dot.visible = true;
      }
    }
  }

  setLastMove(from: Square | null, to: Square | null): void {
    if (from === null || to === null) {
      this.lastMoveMeshes.forEach((m) => (m.visible = false));
      return;
    }
    const pf = this.coords.squareToLocal(from);
    const pt = this.coords.squareToLocal(to);
    this.lastMoveMeshes[0].position.set(pf.x, 0.011, pf.z);
    this.lastMoveMeshes[1].position.set(pt.x, 0.011, pt.z);
    this.lastMoveMeshes.forEach((m) => (m.visible = true));
  }

  setCheck(square: Square | null): void {
    if (square === null) {
      this.checkRing.visible = false;
      return;
    }
    const p = this.coords.squareToLocal(square);
    this.checkRing.position.set(p.x, 0.02, p.z);
    this.checkRing.visible = true;
  }

  update(dt: number): void {
    this.time += dt;
    if (this.checkRing.visible) {
      const s = 1 + Math.sin(this.time * 6) * 0.12;
      this.checkRing.scale.setScalar(s);
      this.checkMat.opacity = 0.65 + Math.sin(this.time * 6) * 0.3;
    }
    if (this.selectionMesh.visible) {
      this.selMat.opacity = 0.35 + Math.sin(this.time * 4) * 0.1;
    }
  }
}
