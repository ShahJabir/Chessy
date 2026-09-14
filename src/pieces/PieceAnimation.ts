// ---------------------------------------------------------------------------
// PieceAnimation — reusable visual animations, independent of the engine.
// The engine says "e2 → e4"; these functions decide HOW it looks.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { Piece3D } from "./Piece3D";
import { CaptureStyle } from "../arena/ArenaTheme";
import { Easing, tweens } from "../three/util";

export interface MoveAnimOptions {
  duration: number;
  lift: number;
  arc: number;
  onLand?: () => void;
}

/** Move a piece from its current position to `to` with lift + glide + land. */
export function animateMove(piece: Piece3D, to: THREE.Vector3, opts: MoveAnimOptions): Promise<void> {
  return new Promise((resolve) => {
    const from = piece.root.position.clone();
    const peak = Math.max(from.y, to.y) + opts.lift;
    const mid = from.clone().lerp(to, 0.5);
    mid.y = peak + opts.arc;
    const curve = new THREE.QuadraticBezierCurve3(from, mid, to.clone().setY(to.y + opts.lift * 0.35));
    let landed = false;

    tweens.add({
      duration: opts.duration,
      ease: Easing.sineInOut,
      onUpdate: (t) => {
        const p = curve.getPoint(t);
        piece.root.position.copy(p);
      },
      onComplete: () => {
        if (!landed) {
          landed = true;
          opts.onLand?.();
          // Settle: tiny landing dip.
          tweens.add({
            duration: 0.14,
            ease: Easing.quadOut,
            onUpdate: (t) => {
              piece.root.position.y = to.y + Math.sin(t * Math.PI) * -0.05;
            },
            onComplete: () => {
              piece.root.position.copy(to);
              resolve();
            },
          });
        }
      },
    });
  });
}

/** Coordinated castling: king and rook travel together, king slightly ahead. */
export async function animateCastle(
  king: Piece3D,
  kingTo: THREE.Vector3,
  rook: Piece3D,
  rookTo: THREE.Vector3,
  duration: number,
): Promise<void> {
  const kingP = animateMove(king, kingTo, { duration, lift: 0.55, arc: 0.15 });
  await new Promise<void>((r) => tweens.add({ duration: duration * 0.12, onUpdate: () => {}, onComplete: () => r() }));
  const rookP = animateMove(rook, rookTo, { duration: duration * 0.92, lift: 0.45, arc: 0.12 });
  await Promise.all([kingP, rookP]);
}

/** Kill a captured piece according to the theme's capture style. */
export function animateCapture(
  piece: Piece3D,
  style: CaptureStyle,
  awayFrom: THREE.Vector3,
  onDone: () => void,
): void {
  piece.dying = true;
  const start = piece.root.position.clone();
  const dir = start.clone().sub(awayFrom);
  dir.y = 0;
  if (dir.lengthSq() < 0.001) dir.set(Math.random() - 0.5, 0, Math.random() - 0.5);
  dir.normalize();

  const dur = style.duration;
  const spin = style.spin;
  const mat = piece.material;
  const startOpacity = mat.opacity;
  mat.transparent = true;

  tweens.add({
    duration: dur,
    ease: Easing.quadIn,
    onUpdate: (t) => {
      switch (style.mode) {
        case "topple": {
          piece.root.position.set(
            start.x + dir.x * t * 3.2,
            start.y - t * t * 7,
            start.z + dir.z * t * 3.2,
          );
          piece.root.rotation.x = dir.z * t * spin;
          piece.root.rotation.z = -dir.x * t * spin;
          break;
        }
        case "sink": {
          piece.root.position.y = start.y - t * 1.4;
          piece.root.rotation.y += 0.05 * spin;
          piece.root.scale.setScalar(Math.max(0.001, 1 - t * 0.85));
          break;
        }
        case "float": {
          piece.root.position.set(
            start.x + dir.x * t * 2.2,
            start.y + t * 2.6,
            start.z + dir.z * t * 2.2,
          );
          piece.root.rotation.x = t * spin * 0.5;
          piece.root.rotation.y += 0.03 * spin;
          break;
        }
      }
      if (style.fade) {
        mat.opacity = startOpacity * (1 - t);
      }
    },
    onComplete: () => {
      if (style.fade) {
        mat.opacity = startOpacity;
      }
      onDone();
    },
  });
}

/** Promotion transformation: pawn shrinks/spins, new piece grows in. */
export function animatePromotion(
  oldPiece: Piece3D,
  newPiece: Piece3D,
): Promise<void> {
  return new Promise((resolve) => {
    newPiece.root.scale.setScalar(0.001);
    tweens.add({
      duration: 0.3,
      ease: Easing.quadIn,
      onUpdate: (t) => {
        oldPiece.root.scale.setScalar(Math.max(0.001, 1 - t));
        oldPiece.root.rotation.y = t * Math.PI * 2;
      },
      onComplete: () => {
        oldPiece.dispose();
        tweens.add({
          duration: 0.42,
          ease: Easing.backOut,
          onUpdate: (t) => {
            newPiece.root.scale.setScalar(Math.max(0.001, t));
            newPiece.root.rotation.y = (1 - t) * -Math.PI * 2;
          },
          onComplete: () => {
            newPiece.root.scale.setScalar(1);
            newPiece.root.rotation.y = 0;
            resolve();
          },
        });
      },
    });
  });
}

/**
 * Selection state change. The actual lift/settle motion is smoothed in the
 * arena's idle loop so it never fights with other transforms.
 */
export function animateSelect(piece: Piece3D, selected: boolean, _speed = 1): void {
  piece.selected = selected;
  if (!selected) piece.clearEmissive();
}
