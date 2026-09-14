// ---------------------------------------------------------------------------
// CHESS ARENA — core chess types & square helpers
// The chess engine is the single source of truth. Nothing in the 3D layer is
// allowed to mutate game state; it only *reacts* to it.
// ---------------------------------------------------------------------------

export type Color = "w" | "b";
export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";

export interface Piece {
  type: PieceType;
  color: Color;
}

/** Square index 0..63. 0 = a1, 63 = h8. file = sq & 7, rank = sq >> 3. */
export type Square = number;

export type CastleSide = "K" | "Q";

export interface Move {
  from: Square;
  to: Square;
  piece: PieceType;
  color: Color;
  /** Captured piece type (for en passant this is "p"). */
  captured?: PieceType;
  /** Set when the move is a pawn promotion. */
  promotion?: PieceType;
  /** Set for en-passant captures. */
  enPassant?: boolean;
  /** Set for castling: "K" = kingside, "Q" = queenside. */
  castle?: CastleSide;
  /** Pawn double push. */
  doublePush?: boolean;
}

export const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

export function fileOf(sq: Square): number {
  return sq & 7;
}
export function rankOf(sq: Square): number {
  return sq >> 3;
}
export function sq(file: number, rank: number): Square {
  return (rank << 3) | file;
}
export function squareName(s: Square): string {
  return FILES[fileOf(s)] + String(rankOf(s) + 1);
}
export function parseSquare(name: string): Square | null {
  if (!name || name.length < 2) return null;
  const f = FILES.indexOf(name[0].toLowerCase());
  const r = parseInt(name[1], 10) - 1;
  if (f < 0 || Number.isNaN(r) || r < 0 || r > 7) return null;
  return sq(f, r);
}
export function other(color: Color): Color {
  return color === "w" ? "b" : "w";
}

export function pieceChar(p: Piece): string {
  const c = p.color === "w" ? p.type.toUpperCase() : p.type;
  return c;
}

export const PIECE_NAMES: Record<PieceType, string> = {
  p: "Pawn",
  n: "Knight",
  b: "Bishop",
  r: "Rook",
  q: "Queen",
  k: "King",
};

export const START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
