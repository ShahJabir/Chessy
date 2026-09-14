// ---------------------------------------------------------------------------
// CinematicCamera — temporary camera control for important events.
// Plays keyframed shots, then hands control back to the orbit controller.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { CameraController } from "./CameraController";
import { Ease, Easing, tweens } from "../three/util";

export interface CameraShot {
  pos: THREE.Vector3;
  look: THREE.Vector3;
  duration: number;
  ease?: Ease;
}

export class CinematicCamera {
  private camera: THREE.PerspectiveCamera;
  private controller: CameraController;
  private active = false;
  private cancelFlag = { cancelled: false };

  constructor(camera: THREE.PerspectiveCamera, controller: CameraController) {
    this.camera = camera;
    this.controller = controller;
  }

  get isPlaying(): boolean {
    return this.active;
  }

  stop(): void {
    this.cancelFlag.cancelled = true;
    this.active = false;
    this.controller.enabled = true;
  }

  /**
   * Play a sequence of shots. Resolves when finished (or immediately if
   * skipped via reducedMotion). Control is returned to the orbit camera
   * afterwards, tweening back to the player's previous framing.
   */
  async play(shots: CameraShot[], opts: { skip?: boolean; restore?: boolean } = {}): Promise<void> {
    if (opts.skip || shots.length === 0) return;
    const flag = { cancelled: false };
    this.cancelFlag = flag;
    this.active = true;
    const saved = this.controller.getOrbitState();
    this.controller.enabled = false;

    let fromPos = this.camera.position.clone();
    let fromLook = new THREE.Vector3(0, 0.35, 0);
    this.camera.getWorldDirection(fromLook);
    fromLook.multiplyScalar(10).add(this.camera.position);

    for (const shot of shots) {
      if (flag.cancelled) break;
      await this.flyTo(fromPos, fromLook, shot.pos, shot.look, shot.duration, shot.ease ?? Easing.cubicInOut, flag);
      fromPos = shot.pos.clone();
      fromLook = shot.look.clone();
    }

    this.active = false;
    this.controller.enabled = true;
    if (opts.restore !== false && !flag.cancelled) {
      this.controller.syncFromCamera(saved);
    } else {
      this.controller.syncFromCamera();
    }
  }

  private flyTo(
    fromPos: THREE.Vector3,
    fromLook: THREE.Vector3,
    toPos: THREE.Vector3,
    toLook: THREE.Vector3,
    duration: number,
    ease: Ease,
    flag: { cancelled: boolean },
  ): Promise<void> {
    return new Promise((resolve) => {
      const look = new THREE.Vector3();
      tweens.add({
        duration,
        ease,
        onUpdate: (t) => {
          if (flag.cancelled) return;
          this.camera.position.lerpVectors(fromPos, toPos, t);
          look.lerpVectors(fromLook, toLook, t);
          this.camera.lookAt(look);
        },
        onComplete: () => resolve(),
      });
    });
  }
}
