// ---------------------------------------------------------------------------
// AI search — negamax with alpha-beta pruning, MVV-LVA move ordering,
// quiescence search and iterative deepening with a time budget.
// The AI always returns a move chosen from engine.legalMoves(), so it can
// never produce an illegal move.
// ---------------------------------------------------------------------------

import { ChessGame } from "../chess/ChessGame";
import { Move } from "../chess/types";
import { MATERIAL, evaluate, EvalOptions } from "./Evaluation";

export type Difficulty = "easy" | "medium" | "hard";

export interface SearchSettings {
  depth: number;
  timeLimitMs: number;
  evalOpts: EvalOptions;
  /** Randomness among near-best moves (centipawn window). 0 = deterministic. */
  randomness: number;
  useQuiescence: boolean;
}

export const DIFFICULTY_SETTINGS: Record<Difficulty, SearchSettings> = {
  easy: {
    depth: 2,
    timeLimitMs: 900,
    evalOpts: {},
    randomness: 90,
    useQuiescence: false,
  },
  medium: {
    depth: 3,
    timeLimitMs: 1800,
    evalOpts: {},
    randomness: 25,
    useQuiescence: true,
  },
  hard: {
    depth: 4,
    timeLimitMs: 3200,
    evalOpts: { kingSafety: true },
    randomness: 0,
    useQuiescence: true,
  },
};

const MATE = 100000;

class TimeUp extends Error {}

export interface SearchReport {
  move: Move;
  score: number;
  depthReached: number;
  nodes: number;
  timeMs: number;
}

export function searchBestMove(game: ChessGame, difficulty: Difficulty): SearchReport | null {
  const settings = DIFFICULTY_SETTINGS[difficulty];
  const legal = game.legalMoves();
  if (legal.length === 0) return null;
  if (legal.length === 1) {
    return { move: legal[0], score: 0, depthReached: 0, nodes: 1, timeMs: 0 };
  }

  const deadline = performance.now() + settings.timeLimitMs;
  let nodes = 0;
  const start = performance.now();

  function scoreMove(m: Move): number {
    let s = 0;
    if (m.captured) s += 10 * MATERIAL[m.captured] - MATERIAL[m.piece]; // MVV-LVA
    if (m.promotion) s += MATERIAL[m.promotion];
    return s;
  }

  function orderMoves(moves: Move[]): Move[] {
    return moves.sort((a, b) => scoreMove(b) - scoreMove(a));
  }

  /** Evaluation from the perspective of the side to move at this node. */
  function leafEval(): number {
    const raw = evaluate(game, settings.evalOpts);
    return game.turn === "w" ? raw : -raw;
  }

  function quiescence(alpha: number, beta: number, qdepth: number): number {
    nodes++;
    const standPat = leafEval();
    if (qdepth <= 0) return standPat;
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;

    const captures = game
      .legalMoves()
      .filter((m) => m.captured || m.promotion)
      .sort((a, b) => scoreMove(b) - scoreMove(a));
    for (const m of captures) {
      game.make(m);
      const score = -quiescence(-beta, -alpha, qdepth - 1);
      game.unmake();
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  function negamax(depth: number, alpha: number, beta: number, ply: number): number {
    if (performance.now() > deadline) throw new TimeUp();
    nodes++;

    const moves = game.legalMoves();
    if (moves.length === 0) {
      return game.inCheck() ? -(MATE - ply) : 0;
    }
    if (depth === 0) {
      if (settings.useQuiescence) return quiescence(alpha, beta, 6);
      return leafEval();
    }

    orderMoves(moves);
    let best = -Infinity;
    for (const m of moves) {
      game.make(m);
      const score = -negamax(depth - 1, -beta, -alpha, ply + 1);
      game.unmake();
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  // Iterative deepening over root moves so we always have a best move even
  // if the final iteration times out.
  let bestMove = legal[0];
  let bestScore = -Infinity;
  let scored: { move: Move; score: number }[] = [];
  let depthReached = 1;

  try {
    for (let depth = 1; depth <= settings.depth; depth++) {
      const rootScores: { move: Move; score: number }[] = [];
      let alpha = -Infinity;
      const ordered = orderMoves(scored.length ? scored.map((s) => s.move) : [...legal]);
      for (const m of ordered) {
        game.make(m);
        const score = -negamax(depth - 1, -Infinity, -alpha, 1);
        game.unmake();
        rootScores.push({ move: m, score });
        if (score > alpha) alpha = score;
      }
      rootScores.sort((a, b) => b.score - a.score);
      scored = rootScores;
      bestMove = rootScores[0].move;
      bestScore = rootScores[0].score;
      depthReached = depth;
      if (bestScore > MATE - 1000) break; // forced mate found
    }
  } catch (e) {
    if (!(e instanceof TimeUp)) throw e;
    if (scored.length) {
      scored.sort((a, b) => b.score - a.score);
      bestMove = scored[0].move;
      bestScore = scored[0].score;
    }
  }

  // Easy/Medium: randomize among near-best moves.
  if (settings.randomness > 0 && scored.length > 1) {
    const candidates = scored.filter((s) => bestScore - s.score <= settings.randomness);
    const pool = candidates.length > 0 ? candidates : scored.slice(0, 1);
    const choice = pool[Math.floor(Math.random() * pool.length)];
    bestMove = choice.move;
    bestScore = choice.score;
  }

  return {
    move: bestMove,
    score: bestScore,
    depthReached,
    nodes,
    timeMs: performance.now() - start,
  };
}
