import { describe, expect, it } from "vitest";
import { GameController, GameConfig } from "./GameController";
import { parseSquare, other } from "../chess/types";
import type { Arena } from "../arena/Arena";
import type { GameUIDelegate } from "./GameController";

/** Chainable fake vector for cinematic math. */
class FakeVec {
  x = 0;
  y = 0;
  z = 0;
  clone(): FakeVec {
    return new FakeVec();
  }
  sub(): FakeVec {
    return this;
  }
  add(): FakeVec {
    return this;
  }
  normalize(): FakeVec {
    return this;
  }
  multiplyScalar(): FakeVec {
    return this;
  }
  set(): FakeVec {
    return this;
  }
  lengthSq(): number {
    return 0;
  }
  lerpVectors(): FakeVec {
    return this;
  }
  copy(): FakeVec {
    return this;
  }
}

/** Minimal arena stub: records calls, never renders. */
function makeArenaStub() {
  const calls = {
    performMove: 0,
    sync: 0,
    checks: [] as (number | null)[],
    lastMove: [] as unknown[],
  };
  const stub = {
    inputDelegate: null,
    cinematic: { isPlaying: false, play: async () => {} },
    camera: { position: new FakeVec() },
    coords: {
      squareToLocal: () => new FakeVec(),
      squareToWorld: () => new FakeVec(),
      group: { worldToLocal: (v: unknown) => v },
    },
    syncFromGame: () => {
      calls.sync++;
    },
    syncFromRaw: () => {
      calls.sync++;
    },
    clearTransient: () => {},
    performMove: async () => {
      calls.performMove++;
      return true;
    },
    setSelected: () => {},
    setLegalMoves: () => {},
    setLastMove: (from: unknown, to: unknown) => calls.lastMove.push([from, to]),
    setCheck: (s: number | null) => calls.checks.push(s),
    flip: () => {},
    faceSide: () => {},
  };
  return { stub: stub as unknown as Arena, calls };
}

function makeUIStub(): { ui: GameUIDelegate; state: Record<string, unknown> } {
  const state: Record<string, unknown> = {
    gameOver: null,
    promotionShown: 0,
    confirmShown: 0,
    thinking: false,
  };
  const ui: GameUIDelegate = {
    onHistoryChanged: (rows, ply) => {
      state.rows = rows;
      state.ply = ply;
    },
    onClocks: (w, b, active) => {
      state.clocks = [w, b, active];
    },
    onTurn: (_c, label) => (state.turn = label),
    onThinking: (t) => {
      state.thinking = t;
    },
    onCheckBanner: (show) => (state.check = show),
    onGameOver: (r) => (state.gameOver = r),
    onReviewMode: (a, p, t) => (state.review = [a, p, t]),
    showPromotion: (_c, choose) => {
      state.promotionShown = (state.promotionShown as number) + 1;
      state.promotionChoice = choose;
    },
    hidePromotion: () => {},
    showConfirm: (decide) => {
      state.confirmShown = (state.confirmShown as number) + 1;
      state.confirmDecision = decide;
    },
  };
  return { ui, state };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("GameController — local game", () => {
  it("plays a full game to fool's mate with correct SAN and events", async () => {
    const { stub, calls } = makeArenaStub();
    const { ui, state } = makeUIStub();
    const c = new GameController(stub);
    c.setUI(ui);

    await c.start({ mode: "local", humanColor: "w", difficulty: "easy", clock: null });

    const seq: [string, string][] = [
      ["f2", "f3"],
      ["e7", "e5"],
      ["g2", "g4"],
      ["d8", "h4"],
    ];
    for (const [from, to] of seq) {
      c.onTap(parseSquare(from));
      c.onTap(parseSquare(to));
      await wait(5);
    }

    expect(calls.performMove).toBe(4);
    expect(state.ply).toBe(4);
    expect((state.rows as { num: number; white: string; black?: string }[])[1]).toMatchObject({
      num: 2,
      white: "g4",
      black: "Qh4#",
    });
    expect(state.gameOver).toMatchObject({ kind: "checkmate", winner: "b" });
    expect(c.game.status()).toBe("checkmate");
    expect(state.check).toBe(false); // banner cleared at game end
  });

  it("rejects illegal input paths (tap on empty square, enemy piece)", async () => {
    const { stub } = makeArenaStub();
    const { ui } = makeUIStub();
    const c = new GameController(stub);
    c.setUI(ui);
    await c.start({ mode: "local", humanColor: "w", difficulty: "easy", clock: null });

    c.onTap(parseSquare("e4")); // empty square: nothing happens
    expect(c.game.plyCount()).toBe(0);
    c.onTap(parseSquare("e7")); // enemy piece: not selectable for white
    expect(c.game.plyCount()).toBe(0);
    c.onTap(parseSquare("e2"));
    c.onTap(parseSquare("e5")); // illegal pawn jump → deselects
    expect(c.game.plyCount()).toBe(0);
    c.onTap(parseSquare("e2")); // reselect
    c.onTap(parseSquare("e4"));
    await wait(5);
    expect(c.game.plyCount()).toBe(1);
  });

  it("undo reverts one ply in local play", async () => {
    const { stub } = makeArenaStub();
    const { ui, state } = makeUIStub();
    const c = new GameController(stub);
    c.setUI(ui);
    await c.start({ mode: "local", humanColor: "w", difficulty: "easy", clock: null });

    c.onTap(parseSquare("e2"));
    c.onTap(parseSquare("e4"));
    await wait(5);
    expect(c.game.plyCount()).toBe(1);
    c.undo();
    expect(c.game.plyCount()).toBe(0);
    expect(state.ply).toBe(0);
    expect(c.game.fen().endsWith("w KQkq - 0 1")).toBe(true);
  });

  it("handles promotion flow through the UI delegate", async () => {
    const { stub } = makeArenaStub();
    const { ui, state } = makeUIStub();
    const c = new GameController(stub);
    c.setUI(ui);
    await c.start({
      mode: "local",
      humanColor: "w",
      difficulty: "easy",
      clock: null,
      startFen: "4k3/P7/8/8/8/8/8/4K3 w - - 0 1",
    });

    c.onTap(parseSquare("a7"));
    c.onTap(parseSquare("a8"));
    await wait(5);
    expect(state.promotionShown).toBe(1);
    expect(c.game.plyCount()).toBe(0); // not committed until choice

    const choose = state.promotionChoice as (t: "q" | null) => void;
    choose("q");
    await wait(5);
    expect(c.game.plyCount()).toBe(1);
    expect(c.game.get(parseSquare("a8")!)).toEqual({ type: "q", color: "w" });
    expect(c.game.inCheck("b")).toBe(true);
  });

  it("supports review mode after a game", async () => {
    const { stub } = makeArenaStub();
    const { ui, state } = makeUIStub();
    const c = new GameController(stub);
    c.setUI(ui);
    await c.start({ mode: "local", humanColor: "w", difficulty: "easy", clock: null });
    c.onTap(parseSquare("e2"));
    c.onTap(parseSquare("e4"));
    await wait(5);
    c.onTap(parseSquare("e7"));
    c.onTap(parseSquare("e5"));
    await wait(5);

    c.enterReview();
    expect(state.review).toEqual([true, 2, 2]);
    c.reviewStep(-1);
    expect(state.review).toEqual([true, 1, 2]);
    c.reviewJump(0);
    expect(state.review).toEqual([true, 0, 2]);
    c.reviewStep(1);
    c.reviewStep(1);
    c.reviewStep(1); // clamped
    expect(state.review).toEqual([true, 2, 2]);
    c.exitReview();
  });
});

describe("GameController — vs AI", () => {
  it("AI responds with legal moves as black", async () => {
    const { stub } = makeArenaStub();
    const { ui, state } = makeUIStub();
    const c = new GameController(stub);
    c.setUI(ui);
    await c.start({ mode: "vsai", humanColor: "w", difficulty: "easy", clock: null });

    // Human plays e4; AI should reply.
    c.onTap(parseSquare("e2"));
    c.onTap(parseSquare("e4"));
    await wait(5);
    expect(c.game.plyCount()).toBe(1);
    expect(state.thinking).toBe(true);

    // Wait for the worker (falls back to main thread in node).
    let waited = 0;
    while (c.game.plyCount() < 2 && waited < 8000) {
      await wait(100);
      waited += 100;
    }
    expect(c.game.plyCount()).toBe(2);
    expect(c.game.turn).toBe("w");
    // AI must stop when the game ends: play fool's mate at the AI.
  }, 15000);

  it("AI vs AI plays several plies without illegal moves", async () => {
    const { stub } = makeArenaStub();
    const { ui } = makeUIStub();
    const c = new GameController(stub);
    c.setUI(ui);
    await c.start({ mode: "aivai", humanColor: "w", difficulty: "easy", clock: null });

    let waited = 0;
    while (c.game.plyCount() < 6 && waited < 20000) {
      await wait(100);
      waited += 100;
    }
    expect(c.game.plyCount()).toBeGreaterThanOrEqual(6);
    // Human input does nothing in aivai.
    c.onTap(parseSquare("e2"));
    expect(c.game.plyCount()).toBeGreaterThanOrEqual(6);
  }, 30000);
});

describe("GameController — clocks", () => {
  it("flags fall and produce a result", async () => {
    const { stub } = makeArenaStub();
    const { ui, state } = makeUIStub();
    const c = new GameController(stub);
    c.setUI(ui);
    await c.start({
      mode: "local",
      humanColor: "w",
      difficulty: "easy",
      clock: { baseMin: 0, incSec: 0 },
    });
    // No clock when baseMin = 0.
    expect((state.clocks as number[])[0]).toBe(-1);

    await c.start({
      mode: "local",
      humanColor: "w",
      difficulty: "easy",
      clock: { baseMin: 1, incSec: 0 },
    });
    expect((state.clocks as number[])[0]).toBe(60000);

    // Simulate time drain.
    c.tickClocks(); // establishes lastTick
    // Drain the clock manually through repeated ticks by rewinding lastTick:
    const anyC = c as unknown as { lastTick: number };
    anyC.lastTick = performance.now() - 61000;
    c.tickClocks();
    expect(state.gameOver).toMatchObject({ kind: "timeout", winner: "b" });
    void other;
  });
});
