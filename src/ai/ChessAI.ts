// ---------------------------------------------------------------------------
// ChessAI — main-thread facade over the search worker. Falls back to running
// the search inline if Web Workers are unavailable.
// ---------------------------------------------------------------------------

import { ChessGame } from "../chess/ChessGame";
import { Move } from "../chess/types";
import { Difficulty, searchBestMove } from "./Search";
import type { AiRequest } from "./aiWorker";

export interface AiMoveResult {
  move: Move | null;
  score: number;
  depth: number;
  nodes: number;
  timeMs: number;
  fromWorker: boolean;
}

let workerSingleton: Worker | null = null;
let workerBroken = false;

function getWorker(): Worker | null {
  if (workerBroken) return null;
  if (workerSingleton) return workerSingleton;
  try {
    workerSingleton = new Worker(new URL("./aiWorker.ts", import.meta.url), {
      type: "module",
    });
    workerSingleton.onerror = () => {
      workerBroken = true;
    };
    return workerSingleton;
  } catch {
    workerBroken = true;
    return null;
  }
}

export class ChessAI {
  private pending = new Map<number, (r: AiMoveResult) => void>();
  private nextId = 1;
  private worker: Worker | null;

  constructor() {
    this.worker = getWorker();
    if (this.worker) {
      this.worker.onmessage = (e: MessageEvent) => {
        const { id, move, score, depth, nodes, timeMs, error } = e.data ?? {};
        const resolve = this.pending.get(id);
        if (!resolve) return;
        this.pending.delete(id);
        if (error || !move) {
          resolve({ move: null, score: 0, depth: 0, nodes: 0, timeMs: 0, fromWorker: true });
        } else {
          resolve({
            move: {
              from: move.from,
              to: move.to,
              promotion: move.promotion ?? undefined,
              piece: "p", // filled in below from the game
              color: "w",
            } as Move,
            score: score ?? 0,
            depth: depth ?? 0,
            nodes: nodes ?? 0,
            timeMs: timeMs ?? 0,
            fromWorker: true,
          });
        }
      };
    }
  }

  /**
   * Ask the AI for a move in the given position. Resolves with a fully
   * populated, legal Move (matched against the provided game), or null when
   * the game is over.
   */
  requestMove(game: ChessGame, difficulty: Difficulty): Promise<AiMoveResult> {
    const fen = game.fen();

    const legalize = (raw: { from: number; to: number; promotion?: string | null } | null) => {
      if (!raw) return null;
      const found = game.legalMoves().find(
        (m) =>
          m.from === raw.from &&
          m.to === raw.to &&
          (m.promotion ?? null) === (raw.promotion ?? null),
      );
      // The AI must never produce an illegal move: if something went wrong,
      // fall back to the first legal move instead of the raw suggestion.
      return found ?? game.legalMoves()[0] ?? null;
    };

    if (!this.worker) {
      return new Promise((resolve) => {
        // Fallback: run synchronously on the main thread.
        setTimeout(() => {
          try {
            const clone = new ChessGame(fen);
            const report = searchBestMove(clone, difficulty);
            resolve({
              move: legalize(report ? report.move : null),
              score: report?.score ?? 0,
              depth: report?.depthReached ?? 0,
              nodes: report?.nodes ?? 0,
              timeMs: report?.timeMs ?? 0,
              fromWorker: false,
            });
          } catch {
            resolve({
              move: legalize(null) ?? game.legalMoves()[0] ?? null,
              score: 0,
              depth: 0,
              nodes: 0,
              timeMs: 0,
              fromWorker: false,
            });
          }
        }, 30);
      });
    }

    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, (result) => {
        result.move = legalize(result.move);
        resolve(result);
      });
      const msg: AiRequest = { id, fen, difficulty };
      this.worker!.postMessage(msg);
    });
  }

  dispose(): void {
    this.pending.clear();
  }
}

export type { Difficulty };
