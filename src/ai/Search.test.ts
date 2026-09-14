import { describe, expect, it } from "vitest";
import { ChessGame } from "../chess/ChessGame";
import { searchBestMove } from "./Search";

describe("AI search", () => {
  it("always returns a legal move from the start position", () => {
    for (const d of ["easy", "medium", "hard"] as const) {
      const g = new ChessGame();
      const report = searchBestMove(g, d);
      expect(report).not.toBeNull();
      const legal = g.legalMoves();
      const found = legal.find(
        (m) =>
          m.from === report!.move.from &&
          m.to === report!.move.to &&
          m.promotion === report!.move.promotion,
      );
      expect(found, `difficulty ${d} produced an illegal move`).toBeDefined();
      // Engine state must be untouched.
      expect(g.fen()).toBe(
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      );
    }
  }, 30000);

  it("finds mate in one (back rank)", () => {
    const g = new ChessGame("6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1");
    const report = searchBestMove(g, "hard");
    expect(report).not.toBeNull();
    expect(report!.move.from).toBe(0); // a1
    expect(report!.move.to).toBe(56); // a8
    g.make(report!.move);
    expect(g.status()).toBe("checkmate");
  }, 20000);

  it("finds mate in one (queen supported)", () => {
    // Scholar's mate ready: Qxf7#
    const g = new ChessGame(
      "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
    );
    const report = searchBestMove(g, "hard");
    expect(report).not.toBeNull();
    expect(report!.move.to).toBe(53); // f7
    expect(report!.move.captured).toBe("p");
  }, 20000);

  it("never makes an illegal move across a full self-play game", () => {
    const g = new ChessGame();
    let plies = 0;
    while (!g.isGameOver() && plies < 60) {
      const report = searchBestMove(g, plies % 2 === 0 ? "easy" : "medium");
      if (!report) break;
      const legal = g.legalMoves().find(
        (m) =>
          m.from === report.move.from &&
          m.to === report.move.to &&
          (m.promotion ?? null) === (report.move.promotion ?? null),
      );
      expect(legal, `illegal move at ply ${plies}`).toBeDefined();
      g.make(legal!);
      plies++;
    }
    expect(plies).toBeGreaterThan(10);
  }, 120000);
});
