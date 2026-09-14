// ---------------------------------------------------------------------------
// CameraController — clamped orbit camera for gameplay. It can never clip
// through the board, go under the environment, or lose the board: distance
// and vertical angle are hard-clamped.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { Easing, tweens } from "../three/util";

const MIN_RADIUS = 7.5;
const MAX_RADIUS = 34;
const MIN_PHI = 0.28; // never top-down gimbal weirdness
const MAX_PHI = 1.32; // never below the board horizon

export class CameraController {
  readonly camera: THREE.PerspectiveCamera;
  enabled = true;

  private theta = 0; // azimuth (0 = white side, +z)
  private phi = 0.92; // polar
  private radius = 17;
  private targetTheta = 0;
  private targetPhi = 0.92;
  private targetRadius = 17;
  private baseTarget = new THREE.Vector3(0, 0.35, 0);
  private target = new THREE.Vector3(0, 0.35, 0);
  /** Temporary emphasis offset (camera nudges toward events). */
  private emphasis = new THREE.Vector3();
  private emphasisDecay = 0;

  constructor(camera: THREE.PerspectiveCamera, whiteSide: boolean) {
    this.camera = camera;
    this.targetTheta = whiteSide ? 0 : Math.PI;
    this.theta = this.targetTheta;
  }

  /** Rotate by pointer deltas. */
  rotate(dx: number, dy: number): void {
    if (!this.enabled) return;
    this.targetTheta -= dx * 0.0052;
    this.targetPhi = THREE.MathUtils.clamp(this.targetPhi - dy * 0.0042, MIN_PHI, MAX_PHI);
  }

  zoom(delta: number): void {
    if (!this.enabled) return;
    this.targetRadius = THREE.MathUtils.clamp(
      this.targetRadius * (1 + delta * 0.0011),
      MIN_RADIUS,
      MAX_RADIUS,
    );
  }

  setZoomFraction(f: number): void {
    this.targetRadius = THREE.MathUtils.lerp(MIN_RADIUS, MAX_RADIUS, THREE.MathUtils.clamp(f, 0, 1));
  }

  /** Flip to the other side of the board. */
  flip(): void {
    this.targetTheta += Math.PI;
  }

  get flipped(): boolean {
    const t = ((this.theta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return t > Math.PI / 2 && t < (3 * Math.PI) / 2;
  }

  /** Face a specific side (theta 0 = white side). */
  faceSide(whiteSide: boolean): void {
    const desired = whiteSide ? 0 : Math.PI;
    let current = this.targetTheta % (Math.PI * 2);
    if (current < 0) current += Math.PI * 2;
    let delta = desired - current;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this.targetTheta = this.targetTheta + delta;
  }

  reset(): void {
    this.targetPhi = 0.92;
    this.targetRadius = 17;
  }

  /** Briefly nudge the camera focus toward a world point (event emphasis). */
  emphasize(worldPoint: THREE.Vector3, strength = 1): void {
    const off = worldPoint.clone().sub(this.baseTarget);
    off.y = 0;
    off.clampLength(0, 1.6);
    this.emphasis.copy(off.multiplyScalar(0.45 * strength));
    this.emphasisDecay = 1.2;
  }

  update(dt: number): void {
    // Smooth-damp toward targets.
    const k = 1 - Math.pow(0.0015, dt);
    this.theta += (this.targetTheta - this.theta) * k;
    this.phi += (this.targetPhi - this.phi) * k;
    this.radius += (this.targetRadius - this.radius) * k;

    if (this.emphasisDecay > 0) {
      this.emphasisDecay -= dt;
      if (this.emphasisDecay <= 0) this.emphasis.set(0, 0, 0);
    }
    this.target.lerpVectors(
      this.baseTarget,
      this.baseTarget.clone().add(this.emphasis),
      Math.max(0, Math.min(1, this.emphasisDecay)),
    );

    if (!this.enabled) return;
    this.apply();
  }

  private apply(): void {
    const sinPhi = Math.sin(this.phi);
    const pos = new THREE.Vector3(
      this.target.x + this.radius * sinPhi * Math.sin(this.theta),
      this.target.y + this.radius * Math.cos(this.phi),
      this.target.z + this.radius * sinPhi * Math.cos(this.theta),
    );
    this.camera.position.copy(pos);
    this.camera.lookAt(this.target);
  }

  /** Capture current pose into the orbit state (after cinematic ends). */
  syncFromCamera(tweenBackTo?: { theta: number; phi: number; radius: number }): void {
    const off = this.camera.position.clone().sub(this.target);
    this.radius = this.targetRadius = THREE.MathUtils.clamp(off.length(), MIN_RADIUS, MAX_RADIUS);
    this.phi = this.targetPhi = THREE.MathUtils.clamp(
      Math.acos(THREE.MathUtils.clamp(off.y / off.length(), -1, 1)),
      MIN_PHI,
      MAX_PHI,
    );
    this.theta = this.targetTheta = Math.atan2(off.x, off.z);
    if (tweenBackTo) {
      const from = { theta: this.theta, phi: this.phi, radius: this.radius };
      let delta = tweenBackTo.theta - from.theta;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      tweens.add({
        duration: 1.1,
        ease: Easing.cubicInOut,
        onUpdate: (t) => {
          this.theta = this.targetTheta = from.theta + delta * t;
          this.phi = this.targetPhi = THREE.MathUtils.lerp(from.phi, tweenBackTo.phi, t);
          this.radius = this.targetRadius = THREE.MathUtils.lerp(from.radius, tweenBackTo.radius, t);
        },
      });
    }
  }

  getOrbitState(): { theta: number; phi: number; radius: number } {
    return { theta: this.theta, phi: this.phi, radius: this.radius };
  }

  setOrbitState(theta: number, phi: number, radius: number): void {
    this.theta = this.targetTheta = theta;
    this.phi = this.targetPhi = THREE.MathUtils.clamp(phi, MIN_PHI, MAX_PHI);
    this.radius = this.targetRadius = THREE.MathUtils.clamp(radius, MIN_RADIUS, MAX_RADIUS);
  }
}
