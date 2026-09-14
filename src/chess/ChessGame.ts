// ---------------------------------------------------------------------------
// CHESS ARENA — ChessGame: a complete, standard FIDE-style chess engine.
//
// This class is the authoritative source of truth for the chess match:
// board, turn, castling rights, en passant, clocks-independent counters,
// legal move generation, check / checkmate / stalemate / draw detection,
// FEN I/O and Standard Algebraic Notation (SAN).
//
// It is intentionally free of any rendering, animation or UI concerns.
// ---------------------------------------------------------------------------

import {
  Color,
  Move,
  Piece,
  PieceType,
  Square,
  CastleSide,
  fileOf,
  rankOf,
  sq,
  squareName,
  other,
  parseSquare,
  START_FEN,
  FILES,
} from "./types";

const CASTLE_WK = 1;
const CASTLE_WQ = 2;
const CASTLE_BK = 4;
const CASTLE_BQ = 8;

const KNIGHT_D = [
  [1, 2], [2, 1], [2, -1], [1, -2],
  [-1, -2], [-2, -1], [-2, 1], [-1, 2],
];
const KING_D = [
  [1, 0], [1, 1], [0, 1], [-1, 1],
  [-1, 0], [-1, -1], [0, -1], [1, -1],
];
const ROOK_D = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP_D = [[1, 1], [-1, 1], [1, -1], [-1, -1]];

export type GameStatus =
  | "playing"
  | "check"
  | "checkmate"
  | "stalemate"
  | "draw-fifty"
  | "draw-threefold"
  | "draw-insufficient";

interface UndoRecord {
  move: Move;
  castling: number;
  ep: Square | null;
  halfmove: number;
  capturedSq: Square | null;
}

export class ChessGame {
  board: (Piece | null)[] = new Array(64).fill(null);
  turn: Color = "w";
  private castling = CASTLE_WK | CASTLE_WQ | CASTLE_BK | CASTLE_BQ;
  private ep: Square | null = null;
  halfmoveClock = 0;
  fullmoveNumber = 1;

  private kingSq: Record<Color, Square> = { w: 4, b: 60 };
  private history: UndoRecord[] = [];
  private repCounts = new Map<string, number>();
  private legalCache: Move[] | null = null;

  constructor(fen: string = START_FEN) {
    this.loadFen(fen);
  }

  // ------------------------------------------------------------------ setup

  loadFen(fen: string): void {
    const parts = fen.trim().split(/\s+/);
    if (parts.length < 2) throw new Error("Invalid FEN: too few fields");
    const ranks = parts[0].split("/");
    if (ranks.length !== 8) throw new Error("Invalid FEN: need 8 ranks");

    const board: (Piece | null)[] = new Array(64).fill(null);
    let wk = -1;
    let bk = -1;
    for (let r = 0; r < 8; r++) {
      const row = ranks[r];
      let file = 0;
      for (const ch of row) {
        if (ch >= "1" && ch <= "8") {
          file += parseInt(ch, 10);
        } else if ("pnbrqkPNBRQK".includes(ch)) {
          if (file > 7) throw new Error("Invalid FEN: rank too long");
          const color: Color = ch === ch.toUpperCase() ? "w" : "b";
          const type = ch.toLowerCase() as PieceType;
          const s = sq(file, 7 - r);
          board[s] = { type, color };
          if (type === "k") {
            if (color === "w") wk = s;
            else bk = s;
          }
          file++;
        } else {
          throw new Error(`Invalid FEN: bad character "${ch}"`);
        }
      }
      if (file !== 8) throw new Error("Invalid FEN: rank does not fill 8 squares");
    }
    if (wk < 0 || bk < 0) throw new Error("Invalid FEN: both kings are required");

    const turn = parts[1];
    if (turn !== "w" && turn !== "b") throw new Error("Invalid FEN: bad side to move");

    let castling = 0;
    const cstr = parts[2] ?? "-";
    if (cstr !== "-") {
      for (const ch of cstr) {
        if (ch === "K") castling |= CASTLE_WK;
        else if (ch === "Q") castling |= CASTLE_WQ;
        else if (ch === "k") castling |= CASTLE_BK;
        else if (ch === "q") castling |= CASTLE_BQ;
        else throw new Error("Invalid FEN: bad castling field");
      }
    }

    let ep: Square | null = null;
    const epStr = parts[3] ?? "-";
    if (epStr !== "-") {
      const s = parseSquare(epStr);
      if (s === null) throw new Error("Invalid FEN: bad en passant square");
      if (!(rankOf(s) === 2 && turn === "b") && !(rankOf(s) === 5 && turn === "w")) {
        throw new Error("Invalid FEN: implausible en passant square");
      }
      ep = s;
    }

    const half = parts[4] !== undefined ? parseInt(parts[4], 10) : 0;
    const full = parts[5] !== undefined ? parseInt(parts[5], 10) : 1;
    if (Number.isNaN(half) || half < 0) throw new Error("Invalid FEN: bad halfmove clock");
    if (Number.isNaN(full) || full < 1) throw new Error("Invalid FEN: bad fullmove number");

    this.board = board;
    this.turn = turn;
    this.castling = castling;
    this.ep = ep;
    this.halfmoveClock = half;
    this.fullmoveNumber = full;
    this.kingSq = { w: wk, b: bk };
    this.history = [];
    this.repCounts = new Map();
    this.repCounts.set(this.positionKey(), 1);
    this.legalCache = null;
  }

  fen(): string {
    let out = "";
    for (let r = 7; r >= 0; r--) {
      let empty = 0;
      for (let f = 0; f < 8; f++) {
        const p = this.board[sq(f, r)];
        if (!p) {
          empty++;
          continue;
        }
        if (empty) {
          out += String(empty);
          empty = 0;
        }
        out += p.color === "w" ? p.type.toUpperCase() : p.type;
      }
      if (empty) out += String(empty);
      if (r > 0) out += "/";
    }
    let c = "";
    if (this.castling & CASTLE_WK) c += "K";
    if (this.castling & CASTLE_WQ) c += "Q";
    if (this.castling & CASTLE_BK) c += "k";
    if (this.castling & CASTLE_BQ) c += "q";
    const epStr = this.ep !== null ? squareName(this.ep) : "-";
    return `${out} ${this.turn} ${c || "-"} ${epStr} ${this.halfmoveClock} ${this.fullmoveNumber}`;
  }

  private positionKey(): string {
    let k = "";
    for (let i = 0; i < 64; i++) {
      const p = this.board[i];
      k += p ? (p.color === "w" ? p.type.toUpperCase() : p.type) : ".";
    }
    return `${k}|${this.turn}|${this.castling}|${this.ep ?? "-"}`;
  }

  // --------------------------------------------------------------- queries

  get(square: Square): Piece | null {
    return this.board[square];
  }

  kingSquare(color: Color): Square {
    return this.kingSq[color];
  }

  inCheck(color: Color = this.turn): boolean {
    return this.isSquareAttacked(this.kingSq[color], other(color));
  }

  /** Is `square` attacked by any piece of color `by`? */
  isSquareAttacked(square: Square, by: Color): boolean {
    const f = fileOf(square);
    const r = rankOf(square);
    const b = this.board;

    // Pawns.
    if (by === "w") {
      if (r > 0) {
        if (f > 0 && this.is(b[square - 9], "p", "w")) return true;
        if (f < 7 && this.is(b[square - 7], "p", "w")) return true;
      }
    } else {
      if (r < 7) {
        if (f > 0 && this.is(b[square + 7], "p", "b")) return true;
        if (f < 7 && this.is(b[square + 9], "p", "b")) return true;
      }
    }

    // Knights.
    for (const [df, dr] of KNIGHT_D) {
      const nf = f + df;
      const nr = r + dr;
      if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
      if (this.is(b[sq(nf, nr)], "n", by)) return true;
    }

    // King.
    for (const [df, dr] of KING_D) {
      const nf = f + df;
      const nr = r + dr;
      if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
      if (this.is(b[sq(nf, nr)], "k", by)) return true;
    }

    // Sliders.
    for (const [df, dr] of ROOK_D) {
      let nf = f + df;
      let nr = r + dr;
      while (nf >= 0 && nf <= 7 && nr >= 0 && nr <= 7) {
        const p = b[sq(nf, nr)];
        if (p) {
          if (p.color === by && (p.type === "r" || p.type === "q")) return true;
          break;
        }
        nf += df;
        nr += dr;
      }
    }
    for (const [df, dr] of BISHOP_D) {
      let nf = f + df;
      let nr = r + dr;
      while (nf >= 0 && nf <= 7 && nr >= 0 && nr <= 7) {
        const p = b[sq(nf, nr)];
        if (p) {
          if (p.color === by && (p.type === "b" || p.type === "q")) return true;
          break;
        }
        nf += df;
        nr += dr;
      }
    }
    return false;
  }

  private is(p: Piece | null, type: PieceType, color: Color): boolean {
    return !!p && p.type === type && p.color === color;
  }

  // -------------------------------------------------------- move generation

  /** All strictly-legal moves for the side to move. Cached until state changes. */
  legalMoves(): Move[] {
    if (this.legalCache) return this.legalCache;
    const pseudo = this.pseudoMoves(this.turn, false);
    const legal: Move[] = [];
    for (const m of pseudo) {
      this.make(m);
      if (!this.inCheck(other(this.turn))) legal.push(m);
      this.unmake();
    }
    this.legalCache = legal;
    return legal;
  }

  legalMovesFrom(from: Square): Move[] {
    return this.legalMoves().filter((m) => m.from === from);
  }

  private pseudoMoves(color: Color, capturesOnly: boolean): Move[] {
    const moves: Move[] = [];
    const b = this.board;
    const enemy = other(color);

    for (let s = 0; s < 64; s++) {
      const p = b[s];
      if (!p || p.color !== color) continue;
      const f = fileOf(s);
      const r = rankOf(s);

      switch (p.type) {
        case "p": {
          const dir = color === "w" ? 8 : -8;
          const startRank = color === "w" ? 1 : 6;
          const promoRank = color === "w" ? 7 : 0;
          const one = s + dir;
          if (!capturesOnly && one >= 0 && one < 64 && !b[one]) {
            this.pushPawn(moves, s, one, p, undefined, undefined);
            const two = s + dir * 2;
            if (r === startRank && !b[two]) {
              moves.push({ from: s, to: two, piece: "p", color, doublePush: true });
            }
          }
          for (const df of [-1, 1]) {
            const nf = f + df;
            if (nf < 0 || nf > 7) continue;
            const t = sq(nf, r) + dir;
            if (t < 0 || t > 63) continue;
            const tp = b[t];
            if (tp && tp.color === enemy) {
              this.pushPawn(moves, s, t, p, tp.type, undefined);
            } else if (t === this.ep && this.ep !== null && !tp) {
              moves.push({ from: s, to: t, piece: "p", color, captured: "p", enPassant: true });
            }
          }
          void promoRank;
          break;
        }
        case "n": {
          for (const [df, dr] of KNIGHT_D) {
            const nf = f + df;
            const nr = r + dr;
            if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
            const t = sq(nf, nr);
            const tp = b[t];
            if (!tp) {
              if (!capturesOnly) moves.push({ from: s, to: t, piece: "n", color });
            } else if (tp.color === enemy) {
              moves.push({ from: s, to: t, piece: "n", color, captured: tp.type });
            }
          }
          break;
        }
        case "k": {
          for (const [df, dr] of KING_D) {
            const nf = f + df;
            const nr = r + dr;
            if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
            const t = sq(nf, nr);
            const tp = b[t];
            if (!tp) {
              if (!capturesOnly) moves.push({ from: s, to: t, piece: "k", color });
            } else if (tp.color === enemy) {
              moves.push({ from: s, to: t, piece: "k", color, captured: tp.type });
            }
          }
          if (!capturesOnly) this.genCastling(moves, color, s);
          break;
        }
        default: {
          const dirs =
            p.type === "r" ? ROOK_D : p.type === "b" ? BISHOP_D : [...ROOK_D, ...BISHOP_D];
          for (const [df, dr] of dirs) {
            let nf = f + df;
            let nr = r + dr;
            while (nf >= 0 && nf <= 7 && nr >= 0 && nr <= 7) {
              const t = sq(nf, nr);
              const tp = b[t];
              if (!tp) {
                if (!capturesOnly) moves.push({ from: s, to: t, piece: p.type, color });
              } else {
                if (tp.color === enemy) {
                  moves.push({ from: s, to: t, piece: p.type, color, captured: tp.type });
                }
                break;
              }
              nf += df;
              nr += dr;
            }
          }
        }
      }
    }
    return moves;
  }

  private pushPawn(
    moves: Move[],
    from: Square,
    to: Square,
    p: Piece,
    captured?: PieceType,
    _unused?: unknown,
  ): void {
    const promoRank = p.color === "w" ? 7 : 0;
    if (rankOf(to) === promoRank) {
      for (const promo of ["q", "r", "b", "n"] as PieceType[]) {
        moves.push({ from, to, piece: "p", color: p.color, captured, promotion: promo });
      }
    } else {
      moves.push({ from, to, piece: "p", color: p.color, captured });
    }
  }

  private genCastling(moves: Move[], color: Color, kingSq: Square): void {
    const home = color === "w" ? 0 : 7;
    if (rankOf(kingSq) !== home || fileOf(kingSq) !== 4) return;
    const enemy = other(color);
    const b = this.board;

    const kRight = color === "w" ? CASTLE_WK : CASTLE_BK;
    if (this.castling & kRight) {
      if (!b[sq(5, home)] && !b[sq(6, home)]) {
        if (
          !this.isSquareAttacked(sq(4, home), enemy) &&
          !this.isSquareAttacked(sq(5, home), enemy) &&
          !this.isSquareAttacked(sq(6, home), enemy)
        ) {
          moves.push({ from: kingSq, to: sq(6, home), piece: "k", color, castle: "K" });
        }
      }
    }
    const qRight = color === "w" ? CASTLE_WQ : CASTLE_BQ;
    if (this.castling & qRight) {
      if (!b[sq(1, home)] && !b[sq(2, home)] && !b[sq(3, home)]) {
        if (
          !this.isSquareAttacked(sq(4, home), enemy) &&
          !this.isSquareAttacked(sq(3, home), enemy) &&
          !this.isSquareAttacked(sq(2, home), enemy)
        ) {
          moves.push({ from: kingSq, to: sq(2, home), piece: "k", color, castle: "Q" });
        }
      }
    }
  }

  // ------------------------------------------------------------- make/unmake

  /** Apply a move. Assumes the move was produced by this engine (legal). */
  make(m: Move): void {
    const b = this.board;
    const rec: UndoRecord = {
      move: m,
      castling: this.castling,
      ep: this.ep,
      halfmove: this.halfmoveClock,
      capturedSq: null,
    };

    let capturedSq: Square | null = null;
    if (m.enPassant) {
      capturedSq = sq(fileOf(m.to), rankOf(m.from));
      b[capturedSq] = null;
    } else if (m.captured) {
      capturedSq = m.to;
      b[m.to] = null;
    }
    rec.capturedSq = capturedSq;

    const piece = b[m.from]!;
    b[m.from] = null;
    b[m.to] = m.promotion ? { type: m.promotion, color: m.color } : piece;

    if (m.piece === "k") {
      this.kingSq[m.color] = m.to;
      if (m.castle === "K") {
        const home = rankOf(m.from) === 0 ? 0 : 7;
        b[sq(5, home)] = b[sq(7, home)];
        b[sq(7, home)] = null;
      } else if (m.castle === "Q") {
        const home = rankOf(m.from) === 0 ? 0 : 7;
        b[sq(3, home)] = b[sq(0, home)];
        b[sq(0, home)] = null;
      }
    }

    // Castling rights updates.
    if (m.piece === "k") {
      this.castling &= m.color === "w" ? ~(CASTLE_WK | CASTLE_WQ) : ~(CASTLE_BK | CASTLE_BQ);
    }
    for (const corner of [0, 7, 56, 63]) {
      if (m.from === corner || m.to === corner) {
        if (corner === 0) this.castling &= ~CASTLE_WQ;
        if (corner === 7) this.castling &= ~CASTLE_WK;
        if (corner === 56) this.castling &= ~CASTLE_BQ;
        if (corner === 63) this.castling &= ~CASTLE_BK;
      }
    }

    this.ep = m.doublePush ? (m.from + m.to) / 2 : null;
    if (m.piece === "p" || m.captured) this.halfmoveClock = 0;
    else this.halfmoveClock++;
    if (m.color === "b") this.fullmoveNumber++;
    this.turn = other(m.color);

    this.history.push(rec);
    const key = this.positionKey();
    this.repCounts.set(key, (this.repCounts.get(key) ?? 0) + 1);
    this.legalCache = null;
  }

  unmake(): void {
    const rec = this.history.pop();
    if (!rec) return;
    const m = rec.move;
    const b = this.board;

    const key = this.positionKey();
    const c = this.repCounts.get(key) ?? 1;
    if (c <= 1) this.repCounts.delete(key);
    else this.repCounts.set(key, c - 1);

    this.turn = m.color;
    if (m.color === "b") this.fullmoveNumber--;
    this.halfmoveClock = rec.halfmove;
    this.ep = rec.ep;
    this.castling = rec.castling;

    const moving: Piece = { type: m.piece, color: m.color };
    b[m.from] = moving;
    b[m.to] = null;
    if (rec.capturedSq !== null) {
      b[rec.capturedSq] = { type: m.captured!, color: other(m.color) };
    }
    if (m.piece === "k") {
      this.kingSq[m.color] = m.from;
      const home = m.color === "w" ? 0 : 7;
      if (m.castle === "K") {
        b[sq(7, home)] = b[sq(5, home)];
        b[sq(5, home)] = null;
      } else if (m.castle === "Q") {
        b[sq(0, home)] = b[sq(3, home)];
        b[sq(3, home)] = null;
      }
    }
    this.legalCache = null;
  }

  // ------------------------------------------------------------------ SAN

  /** Standard Algebraic Notation for a move (engine generates it, with +/#). */
  san(m: Move): string {
    let base: string;
    if (m.castle === "K") base = "O-O";
    else if (m.castle === "Q") base = "O-O-O";
    else {
      const isCapture = !!m.captured;
      if (m.piece === "p") {
        base = isCapture ? `${FILES[fileOf(m.from)]}x${squareName(m.to)}` : squareName(m.to);
        if (m.promotion) base += `=${m.promotion.toUpperCase()}`;
      } else {
        base = m.piece.toUpperCase();
        // Disambiguation.
        const rivals = this.legalMoves().filter(
          (x) => x.piece === m.piece && x.to === m.to && x.from !== m.from,
        );
        if (rivals.length > 0) {
          const sameFile = rivals.some((x) => fileOf(x.from) === fileOf(m.from));
          const sameRank = rivals.some((x) => rankOf(x.from) === rankOf(m.from));
          if (!sameFile) base += FILES[fileOf(m.from)];
          else if (!sameRank) base += String(rankOf(m.from) + 1);
          else base += squareName(m.from);
        }
        if (isCapture) base += "x";
        base += squareName(m.to);
      }
    }

    // Apply and inspect check/mate, then revert.
    this.make(m);
    const opp = this.turn;
    if (this.inCheck(opp)) {
      base += this.legalMoves().length === 0 ? "#" : "+";
    }
    this.unmake();
    return base;
  }

  // ----------------------------------------------------------------- status

  status(): GameStatus {
    const moves = this.legalMoves();
    const check = this.inCheck(this.turn);
    if (moves.length === 0) return check ? "checkmate" : "stalemate";
    if (this.halfmoveClock >= 100) return "draw-fifty";
    if (this.isThreefold()) return "draw-threefold";
    if (this.isInsufficientMaterial()) return "draw-insufficient";
    return check ? "check" : "playing";
  }

  isThreefold(): boolean {
    const key = this.positionKey();
    return (this.repCounts.get(key) ?? 0) >= 3;
  }

  isInsufficientMaterial(): boolean {
    const minors: { type: PieceType; color: Color; square: Square }[] = [];
    for (let i = 0; i < 64; i++) {
      const p = this.board[i];
      if (!p || p.type === "k") continue;
      if (p.type === "p" || p.type === "r" || p.type === "q") return false;
      minors.push({ type: p.type, color: p.color, square: i });
    }
    if (minors.length <= 1) return true;
    if (
      minors.length === 2 &&
      minors[0].type === "b" &&
      minors[1].type === "b" &&
      minors[0].color !== minors[1].color
    ) {
      const sqColor = (s: Square) => (fileOf(s) + rankOf(s)) & 1;
      if (sqColor(minors[0].square) === sqColor(minors[1].square)) return true;
    }
    return false;
  }

  /** True if `color` has any material that could deliver mate (for timeout draws). */
  hasMatingMaterial(color: Color): boolean {
    const minors: PieceType[] = [];
    for (let i = 0; i < 64; i++) {
      const p = this.board[i];
      if (!p || p.color !== color || p.type === "k") continue;
      if (p.type === "p" || p.type === "r" || p.type === "q") return true;
      minors.push(p.type);
    }
    if (minors.length >= 2) return true; // two minors: mate possible (e.g. NN with help, BN)
    return false;
  }

  isGameOver(): boolean {
    const s = this.status();
    return s !== "playing" && s !== "check";
  }

  clone(): ChessGame {
    const g = new ChessGame(this.fen());
    return g;
  }

  // ------------------------------------------------------------------ perft

  /** Debug/test helper: count leaf nodes at depth. */
  perft(depth: number): number {
    if (depth === 0) return 1;
    let nodes = 0;
    for (const m of this.legalMoves()) {
      this.make(m);
      nodes += this.perft(depth - 1);
      this.unmake();
    }
    return nodes;
  }

  cloneFromFen(fen: string): ChessGame {
    return new ChessGame(fen);
  }

  moves(): Move[] {
    return this.history.map((r) => r.move);
  }

  plyCount(): number {
    return this.history.length;
  }
}

export function tryParseFen(fen: string): { ok: true; fen: string } | { ok: false; error: string } {
  try {
    const g = new ChessGame(fen);
    return { ok: true, fen: g.fen() };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
