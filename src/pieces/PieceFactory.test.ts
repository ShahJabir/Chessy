// ---------------------------------------------------------------------------
// PieceFactory — regression tests for procedural geometry building.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { PieceFactory, PIECE_HEIGHTS } from "./PieceFactory";
import { PieceType } from "../chess/types";

const ALL_TYPES: PieceType[] = ["p", "n", "b", "r", "q", "k"];

describe("PieceFactory", () => {
  it("builds a geometry for every piece type without throwing", () => {
    const factory = new PieceFactory();
    for (const type of ALL_TYPES) {
      const geo = factory.geometry(type);
      expect(geo).toBeInstanceOf(THREE.BufferGeometry);
      expect(geo.getAttribute("position").count).toBeGreaterThan(0);
    }
    factory.dispose();
  });

  it("merges parts with mixed indexed/non-indexed sources (knight extrude head)", () => {
    // Regression: ExtrudeGeometry is non-indexed while Lathe/Sphere are
    // indexed; mergeGeometries() used to return null and boot crashed with
    // "geometry merge failed".
    const factory = new PieceFactory();
    const knight = factory.geometry("n");
    expect(knight.index).toBeNull();
    factory.dispose();
  });

  it("produces pieces standing on y=0 with the documented height", () => {
    const factory = new PieceFactory();
    for (const type of ALL_TYPES) {
      const geo = factory.geometry(type);
      geo.computeBoundingBox();
      const bb = geo.boundingBox!;
      expect(bb.min.y).toBeCloseTo(0, 5);
      expect(bb.max.y - bb.min.y).toBeCloseTo(PIECE_HEIGHTS[type], 3);
    }
    factory.dispose();
  });

  it("caches geometries per type", () => {
    const factory = new PieceFactory();
    expect(factory.geometry("q")).toBe(factory.geometry("q"));
    factory.dispose();
  });
});
