// ---------------------------------------------------------------------------
// Sandbox — position editing directly on the 3D battlefield.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { Arena } from "../arena/Arena";
import { Piece, PieceType, Color, START_FEN, parseSquare, squareName, fileOf, rankOf, sq } from "../chess/types";
import { ChessGame, tryParseFen } from "../chess/ChessGame";
import { el, button, clear } from "./dom";
import { audio } from "../audio/AudioManager";
import { Difficulty } from "../ai/Search";
import { PendingGame } from "./Screens";

export function buildSandbox(
  host: HTMLElement,
  arena: Arena,
  onExit: () => void,
  onStartGame: (pending: PendingGame) => void,
): () => void {
  clear(host);

  // --- editor state -------------------------------------------------------
  const state: { board: (Piece | null)[]; turn: Color; ep: string; castle: { K: boolean; Q: boolean; k: boolean; q: boolean } } = {
    board: new ChessGame().board.slice(),
    turn: "w",
    ep: "-",
    castle: { K: true, Q: true, k: true, q: true },
  };

  let brush: PieceType = "p";
  let brushColor: Color = "w";
  let erase = false;

  const render = () => {
    arena.syncFromRaw(state.board);
    fenOut.value = buildFen();
  };

  const buildFen = (): string => {
    let out = "";
    for (let r = 7; r >= 0; r--) {
      let empty = 0;
      for (let f = 0; f < 8; f++) {
        const p = state.board[sq(f, r)];
        if (!p) {
          empty++;
          continue;
        }
        if (empty) {
          out += empty;
          empty = 0;
        }
        out += p.color === "w" ? p.type.toUpperCase() : p.type;
      }
      if (empty) out += empty;
      if (r > 0) out += "/";
    }
    let c = "";
    if (state.castle.K) c += "K";
    if (state.castle.Q) c += "Q";
    if (state.castle.k) c += "k";
    if (state.castle.q) c += "q";
    return `${out} ${state.turn} ${c || "-"} ${state.ep} 0 1`;
  };

  // --- click-to-place on the 3D board -------------------------------------
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downAt = { x: 0, y: 0 };

  const onDown = (e: PointerEvent) => {
    downAt = { x: e.clientX, y: e.clientY };
  };
  const onUp = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) return; // camera drag
    const rect = arena.renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, arena.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plane, hit)) return;
    const square = arena.coords.worldToSquare(hit);
    if (square === null) return;
    if (erase) {
      state.board[square] = null;
    } else {
      state.board[square] = { type: brush, color: brushColor };
    }
    audio.play(state.board[square] ? "select" : "deselect");
    render();
  };

  arena.interaction.enabled = false;
  arena.renderer.domElement.addEventListener("pointerdown", onDown);
  arena.renderer.domElement.addEventListener("pointerup", onUp);

  // --- UI -----------------------------------------------------------------
  const wrap = el("div", { class: "screen sandbox-screen" });
  const panel = el("div", { class: "sandbox-panel" });
  panel.append(el("h2", { text: "SANDBOX" }));

  // Brush palette.
  const palette = el("div", { class: "sandbox-palette" });
  const glyph: Record<PieceType, string> = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
  const pieceBtns = new Map<string, HTMLButtonElement>();
  for (const t of ["k", "q", "r", "b", "n", "p"] as PieceType[]) {
    const b = el("button", { class: "sandbox-piece", text: glyph[t] });
    b.addEventListener("click", () => {
      audio.play("ui");
      brush = t;
      erase = false;
      pieceBtns.forEach((x) => x.classList.remove("chosen"));
      b.classList.add("chosen");
      eraseBtn.classList.remove("chosen");
    });
    if (t === brush) b.classList.add("chosen");
    pieceBtns.set(t, b);
    palette.append(b);
  }
  const eraseBtn = button("✕ ERASE", () => {
    audio.play("ui");
    erase = true;
    pieceBtns.forEach((x) => x.classList.remove("chosen"));
    eraseBtn.classList.add("chosen");
  }, "btn btn-small");
  panel.append(palette, eraseBtn);

  const colorRow = el("div", { class: "setup-row" });
  const wBtn = button("WHITE", () => { brushColor = "w"; wBtn.classList.add("chosen"); bBtn.classList.remove("chosen"); audio.play("ui"); }, "btn btn-option chosen");
  const bBtn = button("BLACK", () => { brushColor = "b"; bBtn.classList.add("chosen"); wBtn.classList.remove("chosen"); audio.play("ui"); }, "btn btn-option");
  colorRow.append(wBtn, bBtn);
  panel.append(colorRow);

  // Side to move + castling + ep.
  const turnRow = el("div", { class: "setup-row" });
  const turnBtn = button("SIDE TO MOVE: WHITE", () => {
    state.turn = state.turn === "w" ? "b" : "w";
    turnBtn.textContent = `SIDE TO MOVE: ${state.turn === "w" ? "WHITE" : "BLACK"}`;
    render();
    audio.play("ui");
  }, "btn btn-option");
  turnRow.append(turnBtn);
  panel.append(turnRow);

  const castleRow = el("div", { class: "setup-row" });
  for (const flag of ["K", "Q", "k", "q"] as const) {
    const c = el("label", { class: "castle-flag", text: flag.toUpperCase() });
    const chk = el("input", { attrs: { type: "checkbox" } }) as HTMLInputElement;
    chk.checked = state.castle[flag];
    chk.addEventListener("change", () => {
      state.castle[flag] = chk.checked;
      render();
    });
    c.prepend(chk);
    castleRow.append(c);
  }
  panel.append(castleRow);

  const epRow = el("div", { class: "setup-row" });
  const epInput = el("input", { class: "ep-input", attrs: { placeholder: "en passant sq (e.g. e3)", value: "-" } }) as HTMLInputElement;
  epInput.addEventListener("change", () => {
    const v = epInput.value.trim();
    if (v === "-" || v === "") {
      state.ep = "-";
    } else if (parseSquare(v) !== null) {
      state.ep = v.toLowerCase();
    } else {
      epInput.value = state.ep;
      return;
    }
    render();
  });
  epRow.append(el("span", { class: "settings-label", text: "EP" }), epInput);
  panel.append(epRow);

  // FEN I/O.
  const fenOut = el("textarea", { class: "fen-box", attrs: { rows: "3", spellcheck: "false" } }) as HTMLTextAreaElement;
  panel.append(fenOut);
  const fenBtns = el("div", { class: "setup-row" });
  fenBtns.append(
    button("COPY", async () => {
      try {
        await navigator.clipboard.writeText(fenOut.value);
      } catch {
        fenOut.select();
        document.execCommand("copy");
      }
      audio.play("ui");
    }, "btn btn-small"),
    button("LOAD", () => {
      const res = tryParseFen(fenOut.value);
      if (!res.ok) {
        fenOut.classList.add("error");
        setTimeout(() => fenOut.classList.remove("error"), 900);
        audio.play("illegal");
        return;
      }
      const g = new ChessGame(res.fen);
      state.board = g.board.slice();
      state.turn = g.turn;
      render();
      audio.play("select");
    }, "btn btn-small"),
    button("START", () => {
      state.board = new ChessGame(START_FEN).board.slice();
      state.turn = "w";
      state.castle = { K: true, Q: true, k: true, q: true };
      state.ep = "-";
      epInput.value = "-";
      render();
      audio.play("ui");
    }, "btn btn-small"),
    button("CLEAR", () => {
      state.board = new Array(64).fill(null);
      state.board[4] = { type: "k", color: "w" };
      state.board[60] = { type: "k", color: "b" };
      render();
      audio.play("deselect");
    }, "btn btn-small"),
  );
  panel.append(fenBtns);

  // Play this position.
  const playRow = el("div", { class: "setup-row" });
  playRow.append(
    button("PLAY VS AI ▸", () => tryPlay("vsai"), "btn btn-gold"),
    button("PLAY LOCAL ▸", () => tryPlay("local"), "btn"),
  );
  panel.append(playRow);

  const tryPlay = (mode: "vsai" | "local") => {
    const fen = buildFen();
    const res = tryParseFen(fen);
    if (!res.ok) {
      audio.play("illegal");
      fenOut.classList.add("error");
      setTimeout(() => fenOut.classList.remove("error"), 900);
      return;
    }
    // Require legal-ish positions: both kings present is enforced by parse.
    onStartGame({
      mode,
      humanColor: "w",
      difficulty: "medium" as Difficulty,
      clockPreset: "unlimited",
      startFen: res.fen,
    });
  };

  panel.append(button("◂ EXIT SANDBOX", () => { audio.play("ui"); onExit(); }));
  wrap.append(panel);
  host.append(wrap);

  render();

  // Cleanup hook.
  return () => {
    arena.interaction.enabled = true;
    arena.renderer.domElement.removeEventListener("pointerdown", onDown);
    arena.renderer.domElement.removeEventListener("pointerup", onUp);
    wrap.remove();
  };
}

export { squareName, fileOf, rankOf };
