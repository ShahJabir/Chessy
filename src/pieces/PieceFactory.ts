// ---------------------------------------------------------------------------
// PieceFactory — procedural, high-quality chess piece geometry.
//
// All pieces are built from primitives (LatheGeometry, ExtrudeGeometry,
// spheres, boxes) merged into ONE geometry per piece type. Geometries are
// cached and shared between colors/themes; materials are swapped by themes.
// An AssetManager-style seam: replace `geometry(type)` results later with
// loaded GLTF models without touching gameplay code.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { PieceType } from "../chess/types";

function lathe(points: [number, number][], segments = 28): THREE.BufferGeometry {
  const v = points.map(([x, y]) => new THREE.Vector2(x, y));
  const geo = new THREE.LatheGeometry(v, segments);
  geo.computeVertexNormals();
  return geo;
}

function translate(geo: THREE.BufferGeometry, x: number, y: number, z: number): THREE.BufferGeometry {
  geo.translate(x, y, z);
  return geo;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  if (!merged) throw new Error("geometry merge failed");
  return merged;
}

/** Normalize geometry so its height equals `target` and its base sits at y=0. */
function normalizeHeight(geo: THREE.BufferGeometry, target: number): THREE.BufferGeometry {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const h = bb.max.y - bb.min.y;
  const s = target / h;
  geo.scale(s, s, s);
  geo.computeBoundingBox();
  geo.translate(0, -geo.boundingBox!.min.y, 0);
  return geo;
}

function pawnGeometry(): THREE.BufferGeometry {
  const body = lathe([
    [0.001, 0], [0.26, 0], [0.275, 0.035], [0.235, 0.075], [0.15, 0.11],
    [0.125, 0.2], [0.12, 0.3], [0.165, 0.345], [0.165, 0.385], [0.11, 0.425],
    [0.095, 0.46],
  ]);
  const head = translate(new THREE.SphereGeometry(0.165, 20, 14), 0, 0.575, 0);
  return normalizeHeight(merge([body, head]), 0.92);
}

function rookGeometry(): THREE.BufferGeometry {
  const body = lathe([
    [0.001, 0], [0.285, 0], [0.3, 0.04], [0.25, 0.085], [0.175, 0.12],
    [0.15, 0.2], [0.145, 0.52], [0.2, 0.58], [0.215, 0.7],
  ]);
  const parts: THREE.BufferGeometry[] = [body];
  // Crenellations.
  const teeth = 5;
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const tooth = new THREE.BoxGeometry(0.1, 0.13, 0.075);
    tooth.translate(Math.cos(a) * 0.165, 0.765, Math.sin(a) * 0.165);
    tooth.rotateY(-a);
    parts.push(tooth);
  }
  const rim = translate(new THREE.CylinderGeometry(0.14, 0.14, 0.05, 20), 0, 0.715, 0);
  parts.push(rim);
  return normalizeHeight(merge(parts), 1.02);
}

function knightGeometry(): THREE.BufferGeometry {
  const base = lathe([
    [0.001, 0], [0.285, 0], [0.3, 0.04], [0.25, 0.085], [0.175, 0.12],
    [0.15, 0.2], [0.165, 0.3],
  ]);

  // Horse head silhouette (x forward, y up), extruded.
  const s = new THREE.Shape();
  s.moveTo(0.2, 0.0);
  s.lineTo(0.27, 0.16);
  s.lineTo(0.34, 0.28);
  s.lineTo(0.47, 0.36);
  s.lineTo(0.545, 0.45);
  s.lineTo(0.475, 0.52);
  s.lineTo(0.33, 0.55);
  s.lineTo(0.2, 0.62);
  s.lineTo(0.16, 0.72);
  s.lineTo(0.24, 0.83); // ear tip
  s.lineTo(0.09, 0.8);
  s.lineTo(0.02, 0.68);
  s.lineTo(-0.1, 0.52);
  s.lineTo(-0.19, 0.32);
  s.lineTo(-0.24, 0.12);
  s.lineTo(-0.21, 0.0);
  s.closePath();

  const head = new THREE.ExtrudeGeometry(s, {
    depth: 0.23,
    bevelEnabled: true,
    bevelThickness: 0.035,
    bevelSize: 0.03,
    bevelSegments: 3,
    curveSegments: 6,
  });
  head.translate(0, 0.16, -0.115);
  const eye = translate(new THREE.SphereGeometry(0.026, 8, 8), 0.3, 0.66, 0.13);
  return normalizeHeight(merge([base, head, eye]), 1.08);
}

function bishopGeometry(): THREE.BufferGeometry {
  const body = lathe([
    [0.001, 0], [0.27, 0], [0.285, 0.04], [0.24, 0.08], [0.16, 0.115],
    [0.135, 0.2], [0.11, 0.36], [0.085, 0.52], [0.13, 0.57], [0.13, 0.615],
    [0.085, 0.65],
  ]);
  const bud = new THREE.SphereGeometry(0.115, 18, 14);
  bud.scale(1, 1.3, 1);
  translate(bud, 0, 0.775, 0);
  const tip = translate(new THREE.SphereGeometry(0.038, 10, 8), 0, 0.95, 0);
  const collar = translate(new THREE.TorusGeometry(0.105, 0.02, 8, 20), 0, 0.64, 0);
  collar.rotateX(Math.PI / 2);
  return normalizeHeight(merge([body, bud, tip, collar]), 1.14);
}

function queenGeometry(): THREE.BufferGeometry {
  const body = lathe([
    [0.001, 0], [0.29, 0], [0.305, 0.04], [0.255, 0.085], [0.17, 0.12],
    [0.14, 0.22], [0.115, 0.4], [0.095, 0.56], [0.14, 0.62], [0.15, 0.7],
    [0.11, 0.74],
  ]);
  const parts: THREE.BufferGeometry[] = [body];
  const crown = translate(new THREE.TorusGeometry(0.115, 0.026, 10, 22), 0, 0.765, 0);
  crown.rotateX(Math.PI / 2);
  parts.push(crown);
  const pearls = 8;
  for (let i = 0; i < pearls; i++) {
    const a = (i / pearls) * Math.PI * 2;
    const p = new THREE.SphereGeometry(0.033, 8, 8);
    p.translate(Math.cos(a) * 0.115, 0.8, Math.sin(a) * 0.115);
    parts.push(p);
  }
  const dome = new THREE.SphereGeometry(0.09, 14, 10);
  dome.scale(1, 0.85, 1);
  translate(dome, 0, 0.81, 0);
  parts.push(dome);
  const orb = translate(new THREE.SphereGeometry(0.042, 10, 8), 0, 0.9, 0);
  parts.push(orb);
  return normalizeHeight(merge(parts), 1.3);
}

function kingGeometry(): THREE.BufferGeometry {
  const body = lathe([
    [0.001, 0], [0.3, 0], [0.315, 0.04], [0.26, 0.085], [0.175, 0.12],
    [0.145, 0.24], [0.12, 0.44], [0.1, 0.6], [0.15, 0.66], [0.155, 0.75],
    [0.115, 0.79],
  ]);
  const parts: THREE.BufferGeometry[] = [body];
  const crown = translate(new THREE.TorusGeometry(0.12, 0.028, 10, 24), 0, 0.82, 0);
  crown.rotateX(Math.PI / 2);
  parts.push(crown);
  const dome = new THREE.SphereGeometry(0.095, 14, 10);
  dome.scale(1, 0.9, 1);
  translate(dome, 0, 0.86, 0);
  parts.push(dome);
  // Cross.
  const v = new THREE.BoxGeometry(0.045, 0.21, 0.045);
  translate(v, 0, 1.03, 0);
  const h = new THREE.BoxGeometry(0.15, 0.045, 0.045);
  translate(h, 0, 1.06, 0);
  parts.push(v, h);
  return normalizeHeight(merge(parts), 1.46);
}

const BUILDERS: Record<PieceType, () => THREE.BufferGeometry> = {
  p: pawnGeometry,
  r: rookGeometry,
  n: knightGeometry,
  b: bishopGeometry,
  q: queenGeometry,
  k: kingGeometry,
};

export class PieceFactory {
  private cache = new Map<PieceType, THREE.BufferGeometry>();

  geometry(type: PieceType): THREE.BufferGeometry {
    let geo = this.cache.get(type);
    if (!geo) {
      geo = BUILDERS[type]();
      this.cache.set(type, geo);
    }
    return geo;
  }

  dispose(): void {
    for (const g of this.cache.values()) g.dispose();
    this.cache.clear();
  }
}

export const PIECE_HEIGHTS: Record<PieceType, number> = {
  p: 0.92,
  r: 1.02,
  n: 1.08,
  b: 1.14,
  q: 1.3,
  k: 1.46,
};
