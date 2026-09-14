// ---------------------------------------------------------------------------
// MoveHistory — recorded game for SAN display and post-game review.
// ---------------------------------------------------------------------------

import { ChessGame } from "./ChessGame";
import { Move, squareName } from "./types";

export interface HistoryEntry {
  move: Move;
  san: string;
  fenBefore: string;
  fenAfter: string;
}

export class MoveHistory {
  readonly startFen: string;
  readonly entries: HistoryEntry[] = [];

  constructor(startFen: string) {
    this.startFen = startFen;
  }

  record(game: ChessGame, move: Move): HistoryEntry {
    const fenBefore = game.fen();
    const san = game.san(move);
    game.make(move);
    const fenAfter = game.fen();
    const entry: HistoryEntry = { move, san, fenBefore, fenAfter };
    this.entries.push(entry);
    return entry;
  }

  /** Reconstruct the position after `ply` half-moves (0 = start position). */
  positionAtPly(ply: number): ChessGame {
    const g = new ChessGame(this.startFen);
    for (let i = 0; i < Math.min(ply, this.entries.length); i++) {
      const m = this.entries[i].move;
      const legal = g.legalMoves().find(
        (x) =>
          x.from === m.from &&
          x.to === m.to &&
          (x.promotion ?? null) === (m.promotion ?? null),
      );
      g.make(legal ?? m);
    }
    return g;
  }

  sanList(): { num: number; white?: string; black?: string }[] {
    const rows: { num: number; white?: string; black?: string }[] = [];
    for (let i = 0; i < this.entries.length; i += 2) {
      rows.push({
        num: i / 2 + 1,
        white: this.entries[i]?.san,
        black: this.entries[i + 1]?.san,
      });
    }
    return rows;
  }

  describe(move: Move): string {
    return `${squareName(move.from)}${move.captured ? "x" : "-"}${squareName(move.to)}`;
  }
}
