// ---------------------------------------------------------------------------
// Arena — orchestrates renderer, scene, board, pieces, camera, particles,
// themes and interaction. The Arena only ever VISUALIZES state that the
// chess engine has authorized; it can rebuild itself from any game state.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { ChessGame } from "../chess/ChessGame";
import { Move, Square, Color, PieceType, fileOf, rankOf, sq } from "../chess/types";
import { Board3D } from "../board/Board3D";
import { BoardCoordinates } from "../board/BoardCoordinates";
import { Piece3D, PieceMaterials } from "../pieces/Piece3D";
import { PieceFactory } from "../pieces/PieceFactory";
import {
  animateCapture,
  animateCastle,
  animateMove,
  animatePromotion,
  animateSelect,
} from "../pieces/PieceAnimation";
import { CameraController } from "../camera/CameraController";
import { CinematicCamera } from "../camera/CinematicCamera";
import { ParticleManager } from "../effects/ParticleManager";
import { InteractionManager, InputDelegate } from "../interaction/InteractionManager";
import { ArenaTheme } from "./ArenaTheme";
import { ThemeRegistry } from "../themes/registry";
import { audio } from "../audio/AudioManager";
import { settings } from "../settings";
import { tweens, disposeObject } from "../three/util";

export class Arena {
  readonly container: HTMLElement;
  renderer!: THREE.WebGLRenderer;
  scene!: THREE.Scene;
  camera!: THREE.PerspectiveCamera;
  readonly coords = new BoardCoordinates();
  board!: Board3D;
  particles!: ParticleManager;
  cameraCtrl!: CameraController;
  cinematic!: CinematicCamera;
  interaction!: InteractionManager;
  theme: ArenaTheme | null = null;

  inputDelegate: InputDelegate | null = null;

  private pieces = new Map<Square, Piece3D>();
  private pieceGroup = new THREE.Group();
  private factory = new PieceFactory();
  private pieceMats: PieceMaterials | null = null;
  private raf = 0;
  private lastTime = 0;
  private disposed = false;
  private glowColor = new THREE.Color(0xffd75e);

  onWebGLFail: ((msg: string) => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  init(): void {
    const s = settings.get();
    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: s.graphics.antialias,
        powerPreference: "high-performance",
      });
    } catch (e) {
      this.onWebGLFail?.(
        "WebGL is not available in this browser, so the 3D arena cannot start.",
      );
      throw e;
    }
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, s.graphics.pixelRatio));
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.shadowMap.enabled = s.graphics.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.style.touchAction = "none";
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      46,
      this.container.clientWidth / Math.max(1, this.container.clientHeight),
      0.1,
      300,
    );

    this.coords.group.add(this.pieceGroup);
    this.scene.add(this.coords.group);
    this.board = new Board3D(this.coords);
    this.particles = new ParticleManager(this.scene);
    this.particles.enabled = s.graphics.effects;

    this.cameraCtrl = new CameraController(this.camera, true);
    this.cinematic = new CinematicCamera(this.camera, this.cameraCtrl);

    this.interaction = new InteractionManager(
      this.renderer.domElement,
      this.camera,
      this.cameraCtrl,
      this.board,
      {
        canGrab: (square) => this.inputDelegate?.canGrab(square) ?? false,
        onTap: (square) => this.inputDelegate?.onTap(square),
        onDragStart: (square) => this.inputDelegate?.onDragStart(square),
        onDragMove: (p) => this.inputDelegate?.onDragMove(p),
        onDragEnd: (from, to) => this.inputDelegate?.onDragEnd(from, to) ?? false,
        inputLocked: () => this.inputDelegate?.inputLocked() ?? true,
      },
    );

    window.addEventListener("resize", this.onResize);
    this.lastTime = performance.now();
    this.loop();
  }

  private onResize = (): void => {
    const w = this.container.clientWidth;
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  // ------------------------------------------------------------- themeing

  async setTheme(id: string): Promise<void> {
    const Ctor = ThemeRegistry.get(id) ?? ThemeRegistry.get("medieval")!;
    const s = settings.get();
    if (this.theme) {
      this.theme.dispose();
      this.theme = null;
    }
    this.scene.background = new THREE.Color(0x0a0c12);
    this.scene.fog = null;
    const theme = new Ctor();
    theme.load({
      scene: this.scene,
      coords: this.coords,
      board: this.board,
      particles: this.particles,
      audio,
      effectsEnabled: s.graphics.effects && !s.accessibility.reducedMotion,
      shadowsEnabled: s.graphics.shadows,
    });
    this.theme = theme;
    this.pieceMats = theme.pieceMaterials();
    for (const piece of this.pieces.values()) piece.setMaterial(this.pieceMats);
    this.glowColor.set(theme.palette().selection);
    audio.startAmbient(id);
    audio.startMusic(id);
  }

  getThemeId(): string {
    return this.theme?.meta().id ?? "medieval";
  }

  // -------------------------------------------------------------- pieces

  private makePiece(type: PieceType, color: Color, square: Square): Piece3D {
    const p = new Piece3D(this.factory.geometry(type), this.pieceMats!, type, color, square);
    const pos = this.coords.squareToLocal(square);
    p.root.position.set(pos.x, 0, pos.z);
    if (type === "n") {
      // Knights face the enemy: white looks toward -z, black toward +z.
      p.facing = color === "w" ? -1 : 1;
      p.root.rotation.y = color === "w" ? Math.PI / 2 : -Math.PI / 2;
    }
    this.pieceGroup.add(p.root);
    return p;
  }

  /** Rebuild the visual position from authoritative game state. */
  syncFromGame(game: ChessGame, opts: { clearCheck?: boolean } = {}): void {
    this.syncFromRaw(game.board, opts);
  }

  /** Rebuild visuals from a raw board array (used by the sandbox editor). */
  syncFromRaw(board: ({ type: PieceType; color: Color } | null)[], opts: { clearCheck?: boolean } = {}): void {
    for (const p of this.pieces.values()) p.dispose();
    this.pieces.clear();
    for (let i = 0; i < 64; i++) {
      const piece = board[i];
      if (!piece) continue;
      this.pieces.set(i, this.makePiece(piece.type, piece.color, i));
    }
    if (opts.clearCheck !== false) this.board.setCheck(null);
    this.board.setSelection(null);
    this.board.setLegalMoves([]);
  }

  getPieceAt(square: Square): Piece3D | undefined {
    return this.pieces.get(square);
  }

  // ------------------------------------------------------------- playing

  private moveDuration(): number {
    const s = settings.get();
    if (s.accessibility.reducedMotion) return 0.08;
    return 0.52 / Math.max(0.35, s.gameplay.animationSpeed);
  }

  /**
   * Visually perform a (validated) move. Resolves when the moving piece(s)
   * have landed. Capture deaths / environment reactions run asynchronously.
   * Returns false when the visual state had drifted and needs a resync.
   */
  async performMove(move: Move): Promise<boolean> {
    const s = settings.get();
    const duration = this.moveDuration();
    const mover = this.pieces.get(move.from);
    if (!mover) {
      return false;
    }

    // Camera emphasis on the destination.
    if (s.gameplay.cameraEffects && !s.accessibility.reducedMotion) {
      this.cameraCtrl.emphasize(this.coords.squareToWorld(move.to), move.captured ? 1 : 0.55);
    }

    // Captured victim.
    let victim: Piece3D | undefined;
    let victimSquare: Square | null = null;
    if (move.captured) {
      victimSquare = move.enPassant
        ? sq(fileOf(move.to), rankOf(move.from))
        : move.to;
      victim = this.pieces.get(victimSquare);
      if (victim) this.pieces.delete(victimSquare);
    }

    const dest = this.coords.squareToLocal(move.to);
    const land = () => {
      if (victim && victimSquare !== null) {
        this.startCaptureDeath(victim, this.coords.squareToLocal(move.to));
      }
    };

    if (move.castle) {
      const home = move.color === "w" ? 0 : 7;
      const rookFromFile = move.castle === "K" ? 7 : 0;
      const rookTo = sq(move.castle === "K" ? 5 : 3, home);
      const rook = this.pieces.get(sq(rookFromFile, home));
      this.pieces.delete(sq(rookFromFile, home));
      mover.square = move.to;
      this.pieces.set(move.to, mover);
      if (rook) {
        rook.square = rookTo;
        this.pieces.set(rookTo, rook);
        mover.busy = rook.busy = true;
        await animateCastle(
          mover,
          dest,
          rook,
          this.coords.squareToLocal(rookTo),
          duration * 1.35,
        );
        mover.busy = rook.busy = false;
        land();
      } else {
        await animateMove(mover, dest, { duration, lift: 0.5, arc: 0.12, onLand: land });
      }
    } else {
      this.pieces.delete(move.from);
      mover.square = move.to;
      this.pieces.set(move.to, mover);
      mover.busy = true;
      await animateMove(mover, dest, {
        duration,
        lift: 0.5 + Math.hypot(fileOf(move.to) - fileOf(move.from), rankOf(move.to) - rankOf(move.from)) * 0.05,
        arc: 0.12,
        onLand: land,
      });
      mover.busy = false;
    }

    // Promotion: transform after landing.
    if (move.promotion && !move.castle) {
      const pawn = this.pieces.get(move.to);
      if (pawn) {
        this.pieces.delete(move.to);
        const promoted = this.makePiece(move.promotion, move.color, move.to);
        promoted.root.position.copy(dest);
        this.pieces.set(move.to, promoted);
        pawn.busy = true;
        await animatePromotion(pawn, promoted);
        pawn.busy = false;
      }
    }
    return true;
  }

  private startCaptureDeath(victim: Piece3D, attackerTarget: THREE.Vector3): void {
    const style = this.theme?.captureStyle() ?? {
      mode: "topple" as const,
      duration: 1.1,
      spin: 3,
      fade: false,
    };
    if (settings.get().accessibility.reducedMotion) {
      // No cinematic fall: quick fade in place.
      const mat = victim.material;
      mat.transparent = true;
      tweens.add({
        duration: 0.3,
        onUpdate: (t) => {
          mat.opacity = 1 - t;
        },
        onComplete: () => {
          mat.opacity = 1;
          victim.dispose();
        },
      });
      return;
    }
    victim.busy = true;
    animateCapture(victim, style, attackerTarget, () => {
      victim.dispose();
    });
  }

  /** Instantly kill remaining visuals of a square's occupant (for undo sync). */
  clearTransient(): void {
    tweens.clear();
  }

  // ---------------------------------------------------------- highlights

  setSelected(square: Square | null): void {
    // Restore previous selection.
    for (const p of this.pieces.values()) {
      if (p.selected && p.square !== square) {
        animateSelect(p, false);
        p.clearEmissive();
      }
    }
    if (square !== null) {
      const p = this.pieces.get(square);
      if (p && !p.selected) {
        animateSelect(p, true);
      }
    }
    this.board.setSelection(square);
  }

  setLegalMoves(targets: { to: Square; capture: boolean }[]): void {
    this.board.setLegalMoves(settings.get().gameplay.showLegalMoves ? targets : []);
  }

  setLastMove(from: Square | null, to: Square | null): void {
    this.board.setLastMove(from, to);
  }

  setCheck(square: Square | null): void {
    this.board.setCheck(square);
    if (square === null) this.theme?.onCheckCleared();
  }

  // -------------------------------------------------------------- camera

  flip(): void {
    this.cameraCtrl.flip();
  }

  faceSide(whiteSide: boolean): void {
    this.cameraCtrl.faceSide(whiteSide);
  }

  resetCamera(): void {
    this.cameraCtrl.reset();
  }

  // ---------------------------------------------------------------- loop

  private loop = (): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    tweens.update(dt);
    this.cameraCtrl.update(dt);
    this.theme?.update(dt);
    this.particles.update(dt);
    this.board.update(dt);
    this.idleUpdate(now / 1000);

    this.renderer.render(this.scene, this.camera);
  };

  private idleUpdate(t: number): void {
    const s = settings.get();
    const animate = !s.accessibility.reducedMotion && s.graphics.effects;
    for (const p of this.pieces.values()) {
      if (p.busy || p.dying) continue;
      const targetY = p.selected ? 0.34 : 0;
      if (animate) {
        // Smooth lift/settle plus a subtle idle bob.
        const bob = Math.sin(t * 1.3 + p.idlePhase) * 0.014;
        p.root.position.y += (targetY + bob - p.root.position.y) * 0.16;
        if (p.selected) {
          p.setEmissive(this.glowColor, 0.32 + Math.sin(t * 5) * 0.12);
        }
      } else {
        p.root.position.y = targetY;
      }
    }
  }

  applyGraphicsSettings(): void {
    const s = settings.get();
    this.renderer.shadowMap.enabled = s.graphics.shadows;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, s.graphics.pixelRatio));
    this.particles.enabled = s.graphics.effects;
    // Toggle shadow casting on all materials to force shader recompile.
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material) {
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        mats.forEach((mat) => (mat.needsUpdate = true));
      }
    });
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
    this.interaction?.dispose();
    this.theme?.dispose();
    for (const p of this.pieces.values()) p.dispose();
    this.pieces.clear();
    this.factory.dispose();
    this.particles.dispose(this.scene);
    disposeObject(this.scene);
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
  }
}
