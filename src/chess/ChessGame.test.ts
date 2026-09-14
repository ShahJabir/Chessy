import { describe, expect, it } from "vitest";
import { ChessGame } from "./ChessGame";
import { Move, parseSquare, squareName } from "./types";

function moveTo(game: ChessGame, from: string, to: string, promotion?: string): Move {
  const m = game
    .legalMoves()
    .find(
      (x) =>
        x.from === parseSquare(from)! &&
        x.to === parseSquare(to)! &&
        (promotion ? x.promotion === promotion : !x.promotion),
    );
  if (!m) throw new Error(`No legal move ${from}-${to}${promotion ?? ""}`);
  return m;
}

function play(game: ChessGame, uciLike: string): void {
  const [from, to, promo] = uciLike.split(/(?=[a-h][1-8])/);
  const m = moveTo(game, from, to, promo ? promo[1] : undefined);
  game.make(m);
}

describe("ChessGame — basics", () => {
  it("sets up the starting position correctly", () => {
    const g = new ChessGame();
    expect(g.fen()).toBe("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    expect(g.get(parseSquare("e1")!)).toEqual({ type: "k", color: "w" });
    expect(g.get(parseSquare("e8")!)).toEqual({ type: "k", color: "b" });
    expect(g.get(parseSquare("d2")!)).toEqual({ type: "p", color: "w" });
    expect(g.legalMoves().length).toBe(20);
  });

  it("perft counts from the start position", () => {
    const g = new ChessGame();
    expect(g.perft(1)).toBe(20);
    expect(g.perft(2)).toBe(400);
    expect(g.perft(3)).toBe(8902);
  });

  it("perft depth 4 start position", () => {
    const g = new ChessGame();
    expect(g.perft(4)).toBe(197281);
  }, 20000);

  it("perft Kiwipete position depth 2", () => {
    const g = new ChessGame(
      "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
    );
    expect(g.legalMoves().length).toBe(48);
    expect(g.perft(2)).toBe(2039);
  });

  it("round-trips FEN", () => {
    const fen = "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1";
    const g = new ChessGame(fen);
    expect(g.fen()).toBe(fen);
  });

  it("rejects invalid FEN", () => {
    expect(() => new ChessGame("not a fen")).toThrow();
    expect(() => new ChessGame("8/8/8/8/8/8/8/8 w - - 0 1")).toThrow(); // no kings
    expect(() => new ChessGame("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR x KQkq - 0 1")).toThrow();
  });

  it("pawn movement: single, double, blocked", () => {
    const g = new ChessGame();
    play(g, "e2e4");
    expect(g.fen()).toBe("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1");
    const e3 = parseSquare("e3")!;
    const e4 = parseSquare("e4")!;
    expect(g.legalMoves().some((m) => m.from === e4 && m.to === e3)).toBe(false);
    play(g, "e7e5");
    expect(g.legalMoves().some((m) => m.from === e4 && m.to === parseSquare("e5")!)).toBe(false);
  });

  it("captures and halfmove clock", () => {
    const g = new ChessGame();
    play(g, "e2e4");
    play(g, "d7d5");
    expect(g.halfmoveClock).toBe(0);
    play(g, "e4d5"); // pawn capture
    expect(g.halfmoveClock).toBe(0);
    play(g, "d8d5");
    const before = g.fen();
    play(g, "b1c3");
    expect(g.halfmoveClock).toBe(1);
    // Undo restores everything.
    g.unmake();
    expect(g.fen()).toBe(before);
  });

  it("undo/redo full fidelity", () => {
    const g = new ChessGame();
    const start = g.fen();
    play(g, "e2e4");
    play(g, "e7e5");
    play(g, "g1f3");
    g.unmake();
    g.unmake();
    g.unmake();
    expect(g.fen()).toBe(start);
    expect(g.legalMoves().length).toBe(20);
  });
});

describe("ChessGame — special moves", () => {
  it("castling kingside and queenside", () => {
    const g = new ChessGame("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    const moves = g.legalMoves();
    expect(moves.some((m) => m.castle === "K" && m.from === 4 && m.to === 6)).toBe(true);
    expect(moves.some((m) => m.castle === "Q" && m.from === 4 && m.to === 2)).toBe(true);
    const mk = moveTo(g, "e1", "g1");
    g.make(mk);
    expect(g.fen()).toBe("r3k2r/8/8/8/8/8/8/R4RK1 b kq - 1 1");
    g.unmake();
    const mq = moveTo(g, "e1", "c1");
    g.make(mq);
    expect(g.fen()).toBe("r3k2r/8/8/8/8/8/8/2KR3R b kq - 1 1");
  });

  it("cannot castle through check", () => {
    // Black rook on f8 attacks f1 down the open f-file: kingside castling is
    // impossible, queenside remains fine.
    const g = new ChessGame("k4r2/8/8/8/8/8/8/R3K2R w KQ - 0 1");
    const moves = g.legalMoves();
    expect(moves.some((m) => m.castle === "K")).toBe(false);
    expect(moves.some((m) => m.castle === "Q")).toBe(true);
  });

  it("cannot castle after king or rook moved (rights update)", () => {
    const g = new ChessGame("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    play(g, "e1e2");
    expect(g.fen().split(" ")[2]).toBe("kq");
    play(g, "e8e7");
    expect(g.fen().split(" ")[2]).toBe("-");
  });

  it("rook capture on a corner removes castling rights", () => {
    // White rook h1 takes black rook h8: white's K right is gone (rook moved)
    // and black's k right is gone (corner captured).
    const g = new ChessGame("k6r/8/8/8/8/8/8/4K2R w Kk - 0 1");
    play(g, "h1h8");
    expect(g.fen().split(" ")[2]).toBe("-");
  });

  it("en passant capture and rights", () => {
    const g = new ChessGame("8/8/8/3Pp3/8/8/8/4K2k w - e6 0 1");
    const m = moveTo(g, "d5", "e6");
    expect(m.enPassant).toBe(true);
    g.make(m);
    expect(g.fen()).toBe("8/8/4P3/8/8/8/8/4K2k b - - 0 1");
    g.unmake();
    expect(g.fen()).toBe("8/8/8/3Pp3/8/8/8/4K2k w - e6 0 1");
  });

  it("promotion offers all four pieces and applies", () => {
    const g = new ChessGame("8/P7/8/8/8/8/8/4K2k w - - 0 1");
    const promos = g.legalMoves().filter((m) => m.from === parseSquare("a7")! && m.promotion);
    expect(promos.map((m) => m.promotion).sort()).toEqual(["b", "n", "q", "r"]);
    const m = moveTo(g, "a7", "a8", "q");
    g.make(m);
    expect(g.get(parseSquare("a8")!)).toEqual({ type: "q", color: "w" });
  });

  it("promotion with capture", () => {
    const g = new ChessGame("1r6/P7/8/8/8/8/8/4K2k w - - 0 1");
    const m = moveTo(g, "a7", "b8", "q");
    expect(m.captured).toBe("r");
    g.make(m);
    expect(g.get(parseSquare("b8")!)).toEqual({ type: "q", color: "w" });
    expect(g.halfmoveClock).toBe(0);
  });
});

describe("ChessGame — check, mate, draws", () => {
  it("fool's mate ends in checkmate", () => {
    const g = new ChessGame();
    play(g, "f2f3");
    play(g, "e7e5");
    play(g, "g2g4");
    play(g, "d8h4");
    expect(g.status()).toBe("checkmate");
    expect(g.inCheck("w")).toBe(true);
    expect(g.legalMoves().length).toBe(0);
  });

  it("detects check status", () => {
    const g = new ChessGame();
    play(g, "e2e4");
    play(g, "e7e5");
    play(g, "f1c4");
    play(g, "b8c6");
    play(g, "d1h5");
    play(g, "g8f6"); // illegal-ish? no, legal, ignores threat
    // Now Qxf7# possible:
    const m = moveTo(g, "h5", "f7");
    const san = g.san(m);
    expect(san).toBe("Qxf7#");
  });

  it("stalemate", () => {
    const g = new ChessGame("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
    expect(g.status()).toBe("stalemate");
    expect(g.inCheck("b")).toBe(false);
  });

  it("insufficient material", () => {
    expect(new ChessGame("8/8/8/8/8/8/8/4K2k w - - 0 1").status()).toBe(
      "draw-insufficient",
    );
    expect(new ChessGame("8/8/8/8/8/8/8/4K1Nk w - - 0 1").status()).toBe(
      "draw-insufficient",
    );
    expect(new ChessGame("8/8/8/8/8/8/8/4KB1k w - - 0 1").status()).toBe(
      "draw-insufficient",
    );
    // Opposite-color bishops (e4 dark, c3 light): NOT insufficient.
    expect(
      new ChessGame("4k3/8/8/8/4B3/2b5/8/4K3 w - - 0 1").status(),
    ).not.toBe("draw-insufficient");
    // Same-color bishops (e4 and d5 are both dark squares): insufficient.
    expect(
      new ChessGame("4k3/8/8/3b4/4B3/8/8/4K3 w - - 0 1").status(),
    ).toBe("draw-insufficient");
    // Rook present: not insufficient.
    expect(new ChessGame("8/8/8/8/8/8/8/R3K2k w - - 0 1").status()).toBe("playing");
  });

  it("fifty-move rule", () => {
    const g = new ChessGame("8/8/8/8/8/8/8/R3K2k w - - 99 60");
    play(g, "a1a2");
    expect(g.halfmoveClock).toBe(100);
    expect(g.status()).toBe("draw-fifty");
  });

  it("threefold repetition", () => {
    const g = new ChessGame();
    const seq = ["g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1", "f6g8"];
    for (const s of seq) play(g, s);
    expect(g.isThreefold()).toBe(true);
    expect(g.status()).toBe("draw-threefold");
  });

  it("timeout mating material helper", () => {
    expect(new ChessGame().hasMatingMaterial("w")).toBe(true);
    expect(new ChessGame("8/8/8/8/8/8/8/4K1Nk w - - 0 1").hasMatingMaterial("w")).toBe(false);
    expect(new ChessGame("8/8/8/8/8/8/8/4KN1k w - - 0 1").hasMatingMaterial("b")).toBe(false);
  });
});

describe("ChessGame — SAN", () => {
  it("basic SAN moves", () => {
    const g = new ChessGame();
    expect(g.san(moveTo(g, "e2", "e4"))).toBe("e4");
    play(g, "e2e4");
    play(g, "e7e5");
    expect(g.san(moveTo(g, "g1", "f3"))).toBe("Nf3");
    play(g, "g1f3");
    play(g, "b8c6");
    expect(g.san(moveTo(g, "f1", "b5"))).toBe("Bb5");
  });

  it("SAN disambiguation", () => {
    // Two knights can reach the same square.
    const g = new ChessGame("4k3/8/8/8/8/5N2/8/N3K2N w - - 0 1");
    // knights a1,f3,h1; f3->d2 and a1 can't reach d2? a1->c2,b3. h1->f2,g3. Only f3 reaches d2? f3d2 yes; a1 no; h1 no. Use f3 and h1 both reaching g... f3->g5? h1->g3. Use d2 via b1? craft better:
    // Knights on b1 and f3 both reach d2.
    const g2 = new ChessGame("4k3/8/8/8/8/5N2/8/1N2K3 w - - 0 1");
    expect(g2.san(moveTo(g2, "f3", "d2"))).toBe("Nfd2");
    void g;
  });

  it("SAN castling notation", () => {
    const g = new ChessGame("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    expect(g.san(moveTo(g, "e1", "g1"))).toBe("O-O");
    expect(g.san(moveTo(g, "e1", "c1"))).toBe("O-O-O");
  });

  it("SAN promotion + check", () => {
    const g = new ChessGame("4k3/P7/8/8/8/8/8/4K3 w - - 0 1");
    expect(g.san(moveTo(g, "a7", "a8", "q"))).toBe("a8=Q+");
  });

  it("SAN pawn capture with file", () => {
    const g = new ChessGame();
    play(g, "e2e4");
    play(g, "d7d5");
    expect(g.san(moveTo(g, "e4", "d5"))).toBe("exd5");
  });
});

describe("ChessGame — square helpers", () => {
  it("converts squares", () => {
    expect(squareName(parseSquare("a1")!)).toBe("a1");
    expect(squareName(parseSquare("h8")!)).toBe("h8");
    expect(squareName(parseSquare("e4")!)).toBe("e4");
    expect(parseSquare("z9")).toBeNull();
  });
});
