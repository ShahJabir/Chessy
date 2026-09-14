// ---------------------------------------------------------------------------
// BoardCoordinates — the single conversion layer between chess squares,
// board-local coordinates and world coordinates.
//
//   Chess Square  →  Board Coordinates  →  World Coordinates
//
// The board group can be rotated/translated (board flips, theme changes);
// conversions go through the group's matrix so they stay correct.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { Square, fileOf, rankOf } from "../chess/types";

export const SQUARE_SIZE = 1;
export const BOARD_EXTENT = 8; // 8 x 8 squares
export const HALF = BOARD_EXTENT / 2;

export class BoardCoordinates {
  /** Group that holds board + pieces. Local space: x right, z toward white. */
  readonly group: THREE.Group;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = "board-root";
  }

  /** Board-local position of a square center (y = board surface). */
  squareToLocal(square: Square, y = 0): THREE.Vector3 {
    const f = fileOf(square);
    const r = rankOf(square);
    return new THREE.Vector3(
      (f - HALF + 0.5) * SQUARE_SIZE,
      y,
      (HALF - r - 0.5) * SQUARE_SIZE, // rank 1 (white) at +z
    );
  }

  squareToWorld(square: Square, y = 0): THREE.Vector3 {
    const v = this.squareToLocal(square, y);
    return this.group.localToWorld(v);
  }

  /** Convert a world-space point to the nearest square, or null if off-board. */
  worldToSquare(point: THREE.Vector3): Square | null {
    const local = this.group.worldToLocal(point.clone());
    const f = Math.floor(local.x + HALF);
    const r = Math.floor(HALF - local.z);
    if (f < 0 || f > 7 || r < 0 || r > 7) return null;
    return (r << 3) | f;
  }

  isLightSquare(square: Square): boolean {
    return (fileOf(square) + rankOf(square)) % 2 === 1;
  }
}
