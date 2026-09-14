// ---------------------------------------------------------------------------
// GameController — gameplay orchestration.
//
//   Chess engine (truth) → events → Arena/Camera/Audio/UI (presentation)
//
// The controller is the only thing allowed to ask the engine to move.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { ChessGame } from "../chess/ChessGame";
import { MoveHistory } from "../chess/MoveHistory";
import { ChessAI } from "../ai/ChessAI";
import { Difficulty } from "../ai/Search";
import { Color, Move, Square, other, squareName } from "../chess/types";
import { EventBus, DrawReason } from "../arena/ArenaEvents";
import { Arena } from "../arena/Arena";
import { InputDelegate } from "../interaction/InteractionManager";
import { audio } from "../audio/AudioManager";
import { settings } from "../settings";
import { Easing, tweens, delay } from "../three/util";

export type GameMode = "vsai" | "local" | "aivai";

export interface GameConfig {
  mode: GameMode;
  /** Human's color in vsai mode. */
  humanColor: Color;
  difficulty: Difficulty;
  /** null = unlimited */
  clock: { baseMin: number; incSec: number } | null;
  startFen?: string;
}

export type GamePhase = "playing" | "gameover" | "review";

export interface ResultInfo {
  kind: "checkmate" | "stalemate" | "draw" | "timeout";
  winner?: Color;
  reason?: DrawReason;
}

export interface GameUIDelegate {
  onHistoryChanged(rows: { num: number; white?: string; black?: string }[], ply: number): void;
  onClocks(w: number, b: number, active: Color | null): void;
  onTurn(color: Color, label: string): void;
  onThinking(thinking: boolean, who?: string): void;
  onCheckBanner(show: boolean, color?: Color): void;
  onGameOver(result: ResultInfo): void;
  onReviewMode(active: boolean, ply: number, total: number): void;
  showPromotion(color: Color, choose: (t: "q" | "r" | "b" | "n" | null) => void): void;
  hidePromotion(): void;
  showConfirm(onDecision: (ok: boolean) => void): void;
}

export class GameController implements InputDelegate {
  game = new ChessGame();
  history = new MoveHistory(this.game.fen());
  readonly bus = new EventBus();
  config: GameConfig = { mode: "local", humanColor: "w", difficulty: "medium", clock: null };

  phase: GamePhase = "playing";
  result: ResultInfo | null = null;

  /** False when no game is active (menu / sandbox browsing). */
  private active = false;

  private arena: Arena;
  private ai = new ChessAI();
  private ui: GameUIDelegate | null = null;

  private selected: Square | null = null;
  private legalTargets: { to: Square; capture: boolean }[] = [];
  private animating = false;
  private aiThinking = false;
  private aiGeneration = 0;
  private promotionPending: { from: Square; to: Square; moves: Move[] } | null = null;
  private confirmPending: { from: Square; to: Square } | null = null;

  private clocks: { w: number; b: number } | null = null;
  private incMs = 0;
  private lastTick = 0;
  private reviewPly = 0;

  constructor(arena: Arena) {
    this.arena = arena;
    arena.inputDelegate = this;
  }

  setUI(ui: GameUIDelegate): void {
    this.ui = ui;
  }

  /** Called when leaving a game (e.g. back to main menu). */
  deactivate(): void {
    this.active = false;
    this.aiGeneration++;
    this.aiThinking = false;
    this.animating = false;
    this.promotionPending = null;
    this.confirmPending = null;
    this.clocks = null;
    this.ui?.onThinking(false);
    this.ui?.onCheckBanner(false);
  }

  // ---------------------------------------------------------------- start

  async start(config: GameConfig): Promise<void> {
    this.config = config;
    this.active = true;
    this.aiGeneration++;
    this.game = new ChessGame(config.startFen ?? undefined);
    this.history = new MoveHistory(this.game.fen());
    this.phase = "playing";
    this.result = null;
    this.selected = null;
    this.legalTargets = [];
    this.animating = false;
    this.aiThinking = false;
    this.promotionPending = null;
    this.confirmPending = null;

    if (config.clock && config.clock.baseMin > 0) {
      const ms = config.clock.baseMin * 60000;
      this.clocks = { w: ms, b: ms };
      this.incMs = config.clock.incSec * 1000;
    } else {
      this.clocks = null;
    }
    this.lastTick = performance.now();

    this.arena.clearTransient();
    this.arena.syncFromGame(this.game);
    this.arena.setLastMove(null, null);
    this.arena.setCheck(null);
    this.arena.setLegalMoves([]);
    this.arena.setSelected(null);

    this.bus.emit({ type: "gamestart", startFen: this.game.fen(), mode: config.mode });
    audio.play("gamestart");
    this.updateHUD();

    // Camera faces the human player.
    const faceWhite = config.mode === "vsai" ? config.humanColor === "w" : true;
    this.arena.faceSide(faceWhite);

    this.maybeScheduleAI();
  }

  // ------------------------------------------------------- input delegate

  inputLocked(): boolean {
    return (
      !this.active ||
      this.phase !== "playing" ||
      this.animating ||
      this.aiThinking ||
      this.promotionPending !== null ||
      this.confirmPending !== null ||
      this.arena.cinematic.isPlaying
    );
  }

  private humanControls(color: Color): boolean {
    if (this.phase !== "playing") return false;
    if (this.config.mode === "local") return true;
    if (this.config.mode === "vsai") return color === this.config.humanColor;
    return false; // aivai
  }

  canGrab(square: Square): boolean {
    if (this.inputLocked()) return false;
    const piece = this.game.get(square);
    return !!piece && piece.color === this.game.turn && this.humanControls(piece.color);
  }

  onTap(square: Square | null): void {
    if (this.inputLocked() || square === null) {
      if (square === null) this.deselect();
      return;
    }
    // Clicking a highlighted destination?
    if (this.selected !== null) {
      const target = this.legalTargets.find((t) => t.to === square);
      if (target) {
        this.tryMove(this.selected, square);
        return;
      }
    }
    // Select own piece.
    const piece = this.game.get(square);
    if (piece && piece.color === this.game.turn && this.humanControls(piece.color)) {
      if (this.selected === square) {
        this.deselect();
        return;
      }
      this.select(square);
      return;
    }
    this.deselect();
  }

  onDragStart(square: Square): void {
    this.select(square, true);
    const piece = this.arena.getPieceAt(square);
    if (piece) {
      piece.busy = true;
      piece.clearEmissive();
    }
  }

  onDragMove(worldPoint: THREE.Vector3): void {
    if (this.selected === null) return;
    const piece = this.arena.getPieceAt(this.selected);
    if (!piece) return;
    const local = this.arena.coords.group.worldToLocal(worldPoint.clone());
    piece.root.position.set(local.x, 0.55, local.z);
  }

  onDragEnd(from: Square, target: Square | null): boolean {
    const piece = this.arena.getPieceAt(from);
    if (target !== null && this.legalTargets.some((t) => t.to === target)) {
      if (piece) piece.busy = false; // performMove takes ownership
      this.tryMove(from, target);
      return true;
    }
    // Snap back.
    if (piece) {
      const home = this.arena.coords.squareToLocal(from);
      const start = piece.root.position.clone();
      tweens.add({
        duration: 0.2,
        ease: Easing.quadOut,
        onUpdate: (t) => piece.root.position.lerpVectors(start, home, t),
        onComplete: () => {
          piece.root.position.copy(home);
          piece.busy = false;
        },
      });
    }
    return false;
  }

  // ------------------------------------------------------------ selection

  private select(square: Square, silent = false): void {
    this.selected = square;
    const moves = this.game.legalMovesFrom(square);
    this.legalTargets = moves.map((m) => ({ to: m.to, capture: !!m.captured }));
    // Deduplicate squares (promotions create 4 moves to the same square).
    const seen = new Set<number>();
    this.legalTargets = this.legalTargets.filter((t) => (seen.has(t.to) ? false : (seen.add(t.to), true)));
    this.arena.setSelected(square);
    this.arena.setLegalMoves(this.legalTargets);
    if (!silent) audio.play("select");
  }

  private deselect(): void {
    if (this.selected === null) return;
    this.selected = null;
    this.legalTargets = [];
    this.arena.setSelected(null);
    this.arena.setLegalMoves([]);
  }

  // ---------------------------------------------------------------- moves

  /** Human attempt to move from one square to another. */
  tryMove(from: Square, to: Square): void {
    if (this.inputLocked()) return;
    const candidates = this.game.legalMoves().filter((m) => m.from === from && m.to === to);
    if (candidates.length === 0) {
      audio.play("illegal");
      return;
    }
    if (candidates.length > 1 && candidates[0].promotion) {
      // Promotion choice required.
      this.promotionPending = { from, to, moves: candidates };
      this.confirmPending = null;
      const color = this.game.turn;
      this.ui?.showPromotion(color, (choice) => {
        this.ui?.hidePromotion();
        const pending = this.promotionPending;
        this.promotionPending = null;
        if (!pending || choice === null) {
          this.select(from);
          return;
        }
        const move = pending.moves.find((m) => m.promotion === choice);
        if (move) this.executeMove(move);
      });
      return;
    }
    if (settings.get().gameplay.confirmMove && this.confirmPending === null) {
      this.confirmPending = { from, to };
      this.confirmMoveViaHUD();
      return;
    }
    this.confirmPending = null;
    this.executeMove(candidates[0]);
  }

  private confirmMoveViaHUD(): void {
    const pending = this.confirmPending!;
    this.ui?.showConfirm((ok) => {
      this.confirmPending = null;
      if (ok) {
        const candidates = this.game.legalMoves().filter(
          (m) => m.from === pending.from && m.to === pending.to,
        );
        if (candidates.length) this.executeMove(candidates[0]);
      } else {
        this.select(pending.from);
      }
    });
  }

  /** Apply an engine-validated move: animate, then commit, then emit events. */
  async executeMove(move: Move): Promise<void> {
    if (this.phase !== "playing") return;
    this.animating = true;
    this.deselect();

    const isCapture = !!move.captured;
    const visualOk = await this.arena.performMove(move);

    if (this.phase !== "playing") {
      this.animating = false;
      return;
    }

    // Commit to the engine (authoritative) and record history.
    const entry = this.history.record(this.game, move);
    if (!visualOk) {
      // Visual state had drifted: rebuild it from the authoritative state.
      this.arena.syncFromGame(this.game);
    }

    // Clocks: increment for the mover.
    if (this.clocks) {
      this.clocks[move.color] += this.incMs;
    }

    // Events.
    this.arena.setLastMove(move.from, move.to);
    if (isCapture) {
      const capturedSquare = move.enPassant
        ? ((move.to & 7) | ((move.from >> 3) << 3)) as Square
        : move.to;
      this.bus.emit({
        type: "capture",
        move,
        attackerColor: move.color,
        capturedType: move.captured!,
        capturedSquare,
      });
    } else {
      this.bus.emit({ type: "move", move });
    }
    if (move.castle) {
      this.bus.emit({ type: "castle", move, side: move.castle, color: move.color });
    }
    if (move.promotion) {
      this.bus.emit({
        type: "promotion",
        move,
        fromType: "p",
        toType: move.promotion,
        color: move.color,
        square: move.to,
      });
    }

    // Status.
    const status = this.game.status();
    this.animating = false;

    if (status === "checkmate") {
      const loser = other(move.color);
      this.finish({ kind: "checkmate", winner: move.color }, () => {
        this.bus.emit({
          type: "checkmate",
          loser,
          winner: move.color,
          kingSquare: this.game.kingSquare(loser),
          finalMove: move,
        });
      });
      return;
    }

    if (status === "stalemate" || status.startsWith("draw")) {
      const reason: DrawReason =
        status === "stalemate"
          ? "stalemate"
          : status === "draw-fifty"
            ? "fifty-move rule"
            : status === "draw-threefold"
              ? "threefold repetition"
              : "insufficient material";
      this.finish({ kind: status === "stalemate" ? "stalemate" : "draw", reason }, () => {
        this.bus.emit({ type: "draw", reason });
      });
      return;
    }

    if (status === "check") {
      const checkedColor = this.game.turn;
      this.arena.setCheck(this.game.kingSquare(checkedColor));
      this.bus.emit({
        type: "check",
        color: checkedColor,
        kingSquare: this.game.kingSquare(checkedColor),
        movedTo: move.to,
      });
    } else {
      this.arena.setCheck(null);
    }

    this.updateHUD(entry.san);
    this.maybeScheduleAI();
  }

  // -------------------------------------------------------------- finish

  private async finish(result: ResultInfo, emitEvent: () => void): Promise<void> {
    this.phase = "gameover";
    this.result = result;
    this.aiGeneration++;
    this.ui?.onThinking(false);
    this.ui?.onCheckBanner(false);

    emitEvent();

    if (result.kind === "checkmate" && result.winner) {
      const s = settings.get();
      if (!s.accessibility.reducedMotion && s.gameplay.cameraEffects) {
        await this.playCheckmateCinematic(result.winner);
      }
      audio.play(this.isHumanWin(result.winner) ? "checkmate-win" : "checkmate-lose");
    } else if (result.kind === "timeout") {
      audio.play(result.winner ? (this.isHumanWin(result.winner) ? "checkmate-win" : "checkmate-lose") : "draw");
    } else {
      audio.play("draw");
    }

    this.bus.emit({ type: "gameend", result: result.kind });
    this.ui?.onGameOver(result);
    this.updateHUD();
  }

  private isHumanWin(winner: Color): boolean {
    if (this.config.mode === "local") return true;
    if (this.config.mode === "vsai") return winner === this.config.humanColor;
    return true;
  }

  private async playCheckmateCinematic(winner: Color): Promise<void> {
    const loserKing = this.game.kingSquare(other(winner));
    const kingPos = this.arena.coords.squareToWorld(loserKing, 0.9);
    const center = new THREE.Vector3(0, 0.4, 0);
    const side = winner === "w" ? 1 : -1;

    const dir = this.arena.camera.position.clone().sub(kingPos);
    dir.y = 0;
    dir.normalize().multiplyScalar(3.4);

    await this.arena.cinematic.play(
      [
        {
          pos: kingPos.clone().add(dir).add(new THREE.Vector3(0, 2.2, 0)),
          look: kingPos.clone(),
          duration: 1.5,
          ease: Easing.cubicInOut,
        },
        {
          pos: kingPos.clone().add(new THREE.Vector3(-dir.z * 1.2, 1.8, dir.x * 1.2)),
          look: kingPos.clone(),
          duration: 1.6,
          ease: Easing.sineInOut,
        },
        {
          pos: new THREE.Vector3(side * 2.5, 7.5, side * 13.5),
          look: center,
          duration: 1.8,
          ease: Easing.cubicInOut,
        },
      ],
      { restore: true },
    );
  }

  // ------------------------------------------------------------------ AI

  private aiColor(): Color | null {
    if (this.config.mode === "vsai") return other(this.config.humanColor);
    return null;
  }

  private maybeScheduleAI(): void {
    if (this.phase !== "playing") return;
    const turn = this.game.turn;
    const isAiTurn =
      this.config.mode === "aivai" || (this.config.mode === "vsai" && turn === this.aiColor());
    if (!isAiTurn) {
      this.ui?.onThinking(false);
      return;
    }
    const gen = ++this.aiGeneration;
    this.aiThinking = true;
    this.ui?.onThinking(true, this.config.mode === "aivai" ? (turn === "w" ? "WHITE AI" : "BLACK AI") : "AI");

    // Small pacing delay so the AI never feels instant.
    const fen = this.game.fen();
    this.ai.requestMove(new ChessGame(fen), this.config.difficulty).then((res) => {
      if (gen !== this.aiGeneration || this.phase !== "playing") return;
      this.aiThinking = false;
      this.ui?.onThinking(false);
      if (!res.move) return;
      const legal = this.game
        .legalMoves()
        .find(
          (m) =>
            m.from === res.move!.from &&
            m.to === res.move!.to &&
            (m.promotion ?? null) === (res.move!.promotion ?? null),
        );
      if (!legal) return; // safety: never play an illegal move
      void this.executeMove(legal);
    });
  }

  // -------------------------------------------------------------- clocks

  tickClocks(): void {
    if (!this.active || !this.clocks) return;
    const now = performance.now();
    const dt = now - this.lastTick;
    this.lastTick = now;
    if (this.phase !== "playing" || this.animating || this.game.isGameOver()) return;
    const turn = this.game.turn;
    this.clocks[turn] -= dt;
    if (this.clocks[turn] <= 0) {
      this.clocks[turn] = 0;
      this.onFlagFall(turn);
    }
  }

  private onFlagFall(loser: Color): void {
    const winner = other(loser);
    if (this.game.hasMatingMaterial(winner)) {
      this.finish({ kind: "timeout", winner }, () => {
        this.bus.emit({ type: "draw", reason: "timeout", loser });
      });
    } else {
      this.finish({ kind: "draw", reason: "timeout" }, () => {
        this.bus.emit({ type: "draw", reason: "timeout", loser });
      });
    }
  }

  // ---------------------------------------------------------------- undo

  canUndo(): boolean {
    return this.phase === "playing" && this.history.entries.length > 0 && !this.animating;
  }

  undo(): void {
    if (!this.canUndo()) return;
    this.aiGeneration++;
    this.aiThinking = false;
    this.promotionPending = null;
    this.confirmPending = null;

    let plies = 1;
    if (this.config.mode === "vsai") {
      // Undo both the AI reply and the human's move when possible.
      if (this.history.entries.length >= 2 && this.game.turn === this.config.humanColor) {
        plies = 2;
      }
    }
    for (let i = 0; i < plies; i++) this.game.unmake();
    // Rebuild the recorded history to match.
    this.history.entries.splice(this.history.entries.length - plies, plies);

    this.deselect();
    this.arena.clearTransient();
    this.arena.syncFromGame(this.game);
    const last = this.history.entries[this.history.entries.length - 1];
    this.arena.setLastMove(last ? last.move.from : null, last ? last.move.to : null);
    this.arena.setCheck(this.game.inCheck() ? this.game.kingSquare(this.game.turn) : null);
    this.ui?.onThinking(false);
    this.updateHUD();
    audio.play("deselect");
    this.maybeScheduleAI();
  }

  // ---------------------------------------------------------------- flip

  flipBoard(): void {
    this.arena.flip();
    audio.play("ui");
  }

  // --------------------------------------------------------------- review

  enterReview(): void {
    if (this.history.entries.length === 0) return;
    this.phase = "review";
    this.reviewPly = this.history.entries.length;
    this.showReviewPly();
    this.ui?.onReviewMode(true, this.reviewPly, this.history.entries.length);
  }

  exitReview(): void {
    this.phase = "gameover";
    this.reviewPly = this.history.entries.length;
    const g = this.history.positionAtPly(this.reviewPly);
    this.arena.syncFromGame(g);
    this.ui?.onReviewMode(false, this.reviewPly, this.history.entries.length);
  }

  reviewStep(delta: number): void {
    const total = this.history.entries.length;
    this.reviewPly = Math.max(0, Math.min(total, this.reviewPly + delta));
    this.showReviewPly();
    audio.play("ui");
  }

  reviewJump(target: 0 | "end"): void {
    this.reviewPly = target === 0 ? 0 : this.history.entries.length;
    this.showReviewPly();
    audio.play("ui");
  }

  private showReviewPly(): void {
    const g = this.history.positionAtPly(this.reviewPly);
    this.arena.clearTransient();
    this.arena.syncFromGame(g, { clearCheck: true });
    const entry = this.history.entries[this.reviewPly - 1];
    this.arena.setLastMove(entry ? entry.move.from : null, entry ? entry.move.to : null);
    if (g.inCheck()) {
      this.arena.setCheck(g.kingSquare(g.turn));
    } else {
      this.arena.setCheck(null);
    }
    this.ui?.onReviewMode(true, this.reviewPly, this.history.entries.length);
    this.updateHUD();
  }

  // ------------------------------------------------------------------ HUD

  private updateHUD(_lastSan?: string): void {
    if (!this.ui) return;
    this.ui.onHistoryChanged(this.history.sanList(), this.history.entries.length);
    if (this.clocks) {
      this.ui.onClocks(this.clocks.w, this.clocks.b, this.phase === "playing" ? this.game.turn : null);
    } else {
      this.ui.onClocks(-1, -1, null);
    }
    const turn = this.game.turn;
    let label = turn === "w" ? "WHITE TO MOVE" : "BLACK TO MOVE";
    if (this.phase === "gameover" && this.result) {
      label = describeResult(this.result);
    }
    this.ui.onTurn(turn, label);
    this.ui.onCheckBanner(this.phase === "playing" && this.game.inCheck(), this.game.turn);
  }

  refreshClocks(): void {
    if (this.clocks && this.ui) {
      this.ui.onClocks(this.clocks.w, this.clocks.b, this.phase === "playing" ? this.game.turn : null);
    }
  }

  // -------------------------------------------------------------- sandbox

  loadPosition(fen: string): void {
    this.game = new ChessGame(fen);
    this.history = new MoveHistory(fen);
    this.phase = "playing";
    this.result = null;
    this.arena.clearTransient();
    this.arena.syncFromGame(this.game);
    this.arena.setLastMove(null, null);
    this.arena.setCheck(null);
    this.updateHUD();
  }

  dispose(): void {
    this.aiGeneration++;
    this.ai.dispose();
    this.bus.clear();
  }
}

export function describeResult(r: ResultInfo): string {
  switch (r.kind) {
    case "checkmate":
      return `${r.winner === "w" ? "WHITE" : "BLACK"} WINS`;
    case "timeout":
      return r.winner ? `${r.winner === "w" ? "WHITE" : "BLACK"} WINS ON TIME` : "DRAW — TIME";
    case "stalemate":
      return "STALEMATE";
    case "draw":
      return `DRAW — ${String(r.reason ?? "").toUpperCase()}`;
  }
}

export { squareName };
