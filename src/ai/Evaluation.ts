// ---------------------------------------------------------------------------
// AI evaluation — material + piece-square tables + light positional terms.
// Scores are from WHITE's point of view (centipawns).
// ---------------------------------------------------------------------------

import { ChessGame } from "../chess/ChessGame";
import { Color, PieceType, Square, fileOf, rankOf } from "../chess/types";

export const MATERIAL: Record<PieceType, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

// Piece-square tables (white's perspective, index 0 = a1).
// prettier-ignore
const PST_PAWN = [
   0,  0,  0,  0,  0,  0,  0,  0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
   5,  5, 10, 25, 25, 10,  5,  5,
   0,  0,  0, 20, 20,  0,  0,  0,
   5, -5,-10,  0,  0,-10, -5,  5,
   5, 10, 10,-20,-20, 10, 10,  5,
   0,  0,  0,  0,  0,  0,  0,  0,
];
// prettier-ignore
const PST_KNIGHT = [
  -50,-40,-30,-30,-30,-30,-40,-50,
  -40,-20,  0,  0,  0,  0,-20,-40,
  -30,  0, 10, 15, 15, 10,  0,-30,
  -30,  5, 15, 20, 20, 15,  5,-30,
  -30,  0, 15, 20, 20, 15,  0,-30,
  -30,  5, 10, 15, 15, 10,  5,-30,
  -40,-20,  0,  5,  5,  0,-20,-40,
  -50,-40,-30,-30,-30,-30,-40,-50,
];
// prettier-ignore
const PST_BISHOP = [
  -20,-10,-10,-10,-10,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  5, 10, 10,  5,  0,-10,
  -10,  5,  5, 10, 10,  5,  5,-10,
  -10,  0, 10, 10, 10, 10,  0,-10,
  -10, 10, 10, 10, 10, 10, 10,-10,
  -10,  5,  0,  0,  0,  0,  5,-10,
  -20,-10,-10,-10,-10,-10,-10,-20,
];
// prettier-ignore
const PST_ROOK = [
   0,  0,  0,  0,  0,  0,  0,  0,
   5, 10, 10, 10, 10, 10, 10,  5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
   0,  0,  0,  5,  5,  0,  0,  0,
];
// prettier-ignore
const PST_QUEEN = [
  -20,-10,-10, -5, -5,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  5,  5,  5,  5,  0,-10,
   -5,  0,  5,  5,  5,  5,  0, -5,
    0,  0,  5,  5,  5,  5,  0, -5,
  -10,  5,  5,  5,  5,  5,  0,-10,
  -10,  0,  5,  0,  0,  0,  0,-10,
  -20,-10,-10, -5, -5,-10,-10,-20,
];
// prettier-ignore
const PST_KING_MID = [
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -20,-30,-30,-40,-40,-30,-30,-20,
  -10,-20,-20,-20,-20,-20,-20,-10,
   20, 20,  0,  0,  0,  0, 20, 20,
   20, 30, 10,  0,  0, 10, 30, 20,
];
// prettier-ignore
const PST_KING_END = [
  -50,-40,-30,-20,-20,-30,-40,-50,
  -30,-20,-10,  0,  0,-10,-20,-30,
  -30,-10, 20, 30, 30, 20,-10,-30,
  -30,-10, 30, 40, 40, 30,-10,-30,
  -30,-10, 30, 40, 40, 30,-10,-30,
  -30,-10, 20, 30, 30, 20,-10,-30,
  -30,-30,  0,  0,  0,  0,-30,-30,
  -50,-30,-30,-30,-30,-30,-30,-50,
];

function mirror(sq: Square): Square {
  // Flip rank for black's PST lookup.
  return (7 - rankOf(sq)) * 8 + fileOf(sq);
}

const PSTS: Record<PieceType, number[]> = {
  p: PST_PAWN,
  n: PST_KNIGHT,
  b: PST_BISHOP,
  r: PST_ROOK,
  q: PST_QUEEN,
  k: PST_KING_MID,
};

export interface EvalOptions {
  kingSafety?: boolean;
}

/** Static evaluation from white's perspective. */
export function evaluate(game: ChessGame, opts: EvalOptions = {}): number {
  let score = 0;
  let whiteQueens = 0;
  let totalNonPawn = 0;
  let whiteBishops = 0;
  let blackBishops = 0;

  for (let s = 0; s < 64; s++) {
    const p = game.board[s];
    if (!p) continue;
    if (p.type !== "p" && p.type !== "k") totalNonPawn++;
    if (p.type === "q" && p.color === "w") whiteQueens++;
    if (p.type === "b") {
      if (p.color === "w") whiteBishops++;
      else blackBishops++;
    }
  }
  const endgame = totalNonPawn <= 6;

  let whiteKingShelter = 0;
  let blackKingShelter = 0;

  for (let s = 0; s < 64; s++) {
    const p = game.board[s];
    if (!p) continue;
    let v = MATERIAL[p.type];
    const table = p.type === "k" ? (endgame ? PST_KING_END : PST_KING_MID) : PSTS[p.type];
    const idx = p.color === "w" ? s : mirror(s);
    v += table[idx];
    score += p.color === "w" ? v : -v;

    if (opts.kingSafety && p.type === "p" && !endgame) {
      // Shield pawns near the castled king.
      const kf = fileOf(game.kingSquare(p.color));
      const kr = rankOf(game.kingSquare(p.color));
      const f = fileOf(s);
      const r = rankOf(s);
      if (Math.abs(f - kf) <= 1) {
        if (p.color === "w" && r === kr + 1) whiteKingShelter += 12;
        if (p.color === "b" && r === kr - 1) blackKingShelter += 12;
      }
    }
  }

  if (whiteBishops >= 2) score += 30; // bishop pair
  if (blackBishops >= 2) score -= 30;

  if (opts.kingSafety) score += whiteKingShelter - blackKingShelter;

  return score;
}

export function scoreForColor(game: ChessGame, color: Color, opts: EvalOptions = {}): number {
  const v = evaluate(game, opts);
  return color === "w" ? v : -v;
}
