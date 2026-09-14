// ---------------------------------------------------------------------------
// InteractionManager — pointer input & raycasting.
//
//   Mouse → Raycast → 3D piece/square → delegate (selection / moves)
//
// Click-to-move is primary; drag-to-move is also supported. Dragging on
// empty space (or squares you can't grab) rotates the camera.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { Square } from "../chess/types";
import { CameraController } from "../camera/CameraController";
import { Board3D } from "../board/Board3D";
import { Piece3D } from "../pieces/Piece3D";

export interface InputDelegate {
  canGrab(square: Square): boolean;
  onTap(square: Square | null): void;
  onDragStart(square: Square): void;
  onDragMove(worldPoint: THREE.Vector3): void;
  onDragEnd(from: Square, target: Square | null): boolean;
  inputLocked(): boolean;
}

export class InteractionManager {
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private delegate: InputDelegate;
  private camera: THREE.PerspectiveCamera;
  private cameraCtrl: CameraController;
  private board: Board3D;
  private dom: HTMLElement;

  private down = false;
  private downPos = { x: 0, y: 0 };
  private moved = 0;
  private mode: "none" | "orbit" | "drag" | "tap" = "none";
  private dragFrom: Square | null = null;
  private dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.55);
  enabled = true;

  constructor(
    dom: HTMLElement,
    camera: THREE.PerspectiveCamera,
    cameraCtrl: CameraController,
    board: Board3D,
    delegate: InputDelegate,
  ) {
    this.dom = dom;
    this.camera = camera;
    this.cameraCtrl = cameraCtrl;
    this.board = board;
    this.delegate = delegate;

    dom.addEventListener("pointerdown", this.onDown);
    window.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerup", this.onUp);
    dom.addEventListener("wheel", this.onWheel, { passive: false });
    dom.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  private setPointer(e: PointerEvent | WheelEvent): void {
    const rect = this.dom.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private raycastBoard(): { square: Square | null; piece: Piece3D | null; point: THREE.Vector3 | null } {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    // Pieces first.
    const pieces: THREE.Object3D[] = [];
    this.board.coords.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.userData.piece) pieces.push(o);
    });
    const pieceHits = this.raycaster.intersectObjects(pieces, false);
    for (const h of pieceHits) {
      const p = h.object.userData.piece as Piece3D;
      if (p.dying) continue;
      return { square: p.square, piece: p, point: h.point };
    }
    const squareHits = this.raycaster.intersectObjects(this.board.squares, false);
    if (squareHits.length > 0) {
      const sq = squareHits[0].object.userData.square as Square;
      return { square: sq, piece: null, point: squareHits[0].point };
    }
    return { square: null, piece: null, point: null };
  }

  private planePoint(): THREE.Vector3 | null {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const out = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(this.dragPlane, out);
    return hit ? out : null;
  }

  private onDown = (e: PointerEvent): void => {
    if (!this.enabled) return;
    if (e.button !== 0 && e.button !== 2) return;
    this.down = true;
    this.moved = 0;
    this.downPos = { x: e.clientX, y: e.clientY };
    this.setPointer(e);

    if (this.delegate.inputLocked()) {
      this.mode = "orbit";
      return;
    }

    const hit = this.raycastBoard();
    if (e.button === 0 && hit.square !== null && this.delegate.canGrab(hit.square)) {
      this.mode = "tap"; // may become drag
      this.dragFrom = hit.square;
      return;
    }
    this.mode = "orbit";
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.down || !this.enabled) return;
    const dx = e.clientX - this.downPos.x;
    const dy = e.clientY - this.downPos.y;
    this.moved = Math.max(this.moved, Math.hypot(dx, dy));

    if (this.mode === "orbit") {
      this.cameraCtrl.rotate(e.movementX, e.movementY);
      return;
    }

    if (this.mode === "tap" && this.moved > 14 && this.dragFrom !== null) {
      if (this.delegate.inputLocked()) {
        this.mode = "orbit";
        return;
      }
      this.mode = "drag";
      this.delegate.onDragStart(this.dragFrom);
    }

    if (this.mode === "drag") {
      const p = this.planePoint();
      if (p) this.delegate.onDragMove(p);
    }
  };

  private onUp = (e: PointerEvent): void => {
    if (!this.down || !this.enabled) {
      this.down = false;
      return;
    }
    this.down = false;
    if (this.delegate.inputLocked()) {
      this.mode = "none";
      return;
    }

    if (this.mode === "drag" && this.dragFrom !== null) {
      this.setPointer(e);
      const hit = this.raycastBoard();
      const accepted = this.delegate.onDragEnd(this.dragFrom, hit.square);
      if (!accepted) {
        // Delegate snaps the piece back visually.
      }
      this.dragFrom = null;
      this.mode = "none";
      return;
    }

    if (this.mode === "tap" && this.moved < 8) {
      this.setPointer(e);
      const hit = this.raycastBoard();
      this.delegate.onTap(hit.square);
    }
    this.mode = "none";
    this.dragFrom = null;
  };

  private onWheel = (e: WheelEvent): void => {
    if (!this.enabled) return;
    e.preventDefault();
    this.cameraCtrl.zoom(e.deltaY);
  };

  dispose(): void {
    this.dom.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerup", this.onUp);
    this.dom.removeEventListener("wheel", this.onWheel);
  }
}
