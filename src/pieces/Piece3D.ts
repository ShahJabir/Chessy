// ---------------------------------------------------------------------------
// Piece3D — a single visual chess piece. Purely presentational: its square
// is dictated by the game state; it never decides anything itself.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { Color, PieceType } from "../chess/types";

export interface PieceMaterials {
  white: THREE.MeshStandardMaterial;
  black: THREE.MeshStandardMaterial;
}

let nextId = 1;

export class Piece3D {
  readonly id = nextId++;
  readonly root: THREE.Group;
  readonly mesh: THREE.Mesh;
  type: PieceType;
  color: Color;
  square: number;
  /** Visual resting height above the board surface. */
  baseY = 0;
  selected = false;
  dying = false;
  /** True while a scripted animation (or drag) owns this piece's transform. */
  busy = false;
  /** Theme-controlled idle phase offset. */
  idlePhase = Math.random() * Math.PI * 2;
  /** Face direction for knights (1 = toward black, -1 = toward white). */
  facing: 1 | -1 = 1;

  private baseEmissive = new THREE.Color(0x000000);
  private baseEmissiveIntensity = 0;

  constructor(
    geometry: THREE.BufferGeometry,
    materials: PieceMaterials,
    type: PieceType,
    color: Color,
    square: number,
  ) {
    this.type = type;
    this.color = color;
    this.square = square;
    this.root = new THREE.Group();
    this.mesh = new THREE.Mesh(geometry, (color === "w" ? materials.white : materials.black).clone());
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.userData.piece = this;
    this.root.add(this.mesh);
    this.root.userData.piece = this;
    this.captureBaseEmissive();
  }

  private captureBaseEmissive(): void {
    const mat = this.material;
    this.baseEmissive.copy(mat.emissive);
    this.baseEmissiveIntensity = mat.emissiveIntensity;
  }

  get material(): THREE.MeshStandardMaterial {
    return this.mesh.material as THREE.MeshStandardMaterial;
  }

  setMaterial(materials: PieceMaterials): void {
    this.material.dispose();
    this.mesh.material = (this.color === "w" ? materials.white : materials.black).clone();
    this.captureBaseEmissive();
  }

  setEmissive(color: THREE.ColorRepresentation, intensity: number): void {
    const mat = this.material;
    mat.emissive.set(color);
    mat.emissiveIntensity = intensity;
  }

  clearEmissive(): void {
    const mat = this.material;
    mat.emissive.copy(this.baseEmissive);
    mat.emissiveIntensity = this.baseEmissiveIntensity;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.material.dispose();
  }
}
