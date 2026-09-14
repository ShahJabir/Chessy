// ---------------------------------------------------------------------------
// GameHUD — in-game interface: clocks, move history, controls, banners,
// promotion & confirm dialogs, game-over overlay, review bar.
// ---------------------------------------------------------------------------

import { Color } from "../chess/types";
import { GameUIDelegate, ResultInfo, describeResult } from "../game/GameController";
import { el, button, clear, formatClock } from "./dom";
import { audio } from "../audio/AudioManager";
import { settings } from "../settings";

export interface GameHUDActions {
  onUndo(): void;
  onFlip(): void;
  onSettings(): void;
  onExit(): void;
  onNewGame(): void;
  onReview(): void;
  onMainMenu(): void;
  onReviewStep(delta: number): void;
  onReviewJump(target: 0 | "end"): void;
  onReviewExit(): void;
}

export class GameHUD implements GameUIDelegate {
  readonly root: HTMLElement;
  private blackPlate!: HTMLElement;
  private whitePlate!: HTMLElement;
  private blackClock!: HTMLElement;
  private whiteClock!: HTMLElement;
  private moveList!: HTMLElement;
  private checkBanner!: HTMLElement;
  private thinking!: HTMLElement;
  private turnLabel!: HTMLElement;
  private promoOverlay!: HTMLElement;
  private confirmOverlay!: HTMLElement;
  private gameOverOverlay!: HTMLElement;
  private gameOverTitle!: HTMLElement;
  private gameOverSub!: HTMLElement;
  private reviewBar!: HTMLElement;
  private reviewPos!: HTMLElement;
  private actions: GameHUDActions;
  private lastClockWarn = 0;
  private promoResolve: ((t: "q" | "r" | "b" | "n" | null) => void) | null = null;

  constructor(actions: GameHUDActions) {
    this.actions = actions;
    this.root = el("div", { class: "hud" });

    // Player plates.
    this.blackPlate = el("div", { class: "plate plate-top" });
    this.blackPlate.append(
      el("div", { class: "plate-name", text: "BLACK" }),
      (this.blackClock = el("div", { class: "clock", text: "--:--" })),
    );
    this.whitePlate = el("div", { class: "plate plate-bottom" });
    this.whitePlate.append(
      el("div", { class: "plate-name", text: "WHITE" }),
      (this.whiteClock = el("div", { class: "clock", text: "--:--" })),
    );

    // Turn / status strip.
    const status = el("div", { class: "status-strip" });
    this.turnLabel = el("div", { class: "turn-label" });
    this.thinking = el("div", { class: "thinking", text: "AI THINKING…" });
    this.thinking.hidden = true;
    this.checkBanner = el("div", { class: "check-banner", text: "CHECK" });
    this.checkBanner.hidden = true;
    status.append(this.turnLabel, this.thinking, this.checkBanner);

    // Move history + controls panel.
    const panel = el("div", { class: "side-panel" });
    panel.append(el("div", { class: "panel-title", text: "MOVE HISTORY" }));
    this.moveList = el("div", { class: "move-list" });
    panel.append(this.moveList);
    const controls = el("div", { class: "controls" });
    controls.append(
      button("UNDO", () => { audio.play("ui"); actions.onUndo(); }),
      button("FLIP", () => actions.onFlip()),
      button("SETTINGS", () => actions.onSettings()),
      button("EXIT", () => actions.onExit()),
    );
    panel.append(controls);

    // Promotion dialog.
    this.promoOverlay = el("div", { class: "overlay" });
    this.promoOverlay.hidden = true;

    // Confirm dialog.
    this.confirmOverlay = el("div", { class: "overlay" });
    this.confirmOverlay.hidden = true;

    // Game over overlay.
    this.gameOverOverlay = el("div", { class: "overlay gameover-overlay" });
    const goBox = el("div", { class: "gameover-box" });
    this.gameOverTitle = el("div", { class: "gameover-title", text: "CHECKMATE" });
    this.gameOverSub = el("div", { class: "gameover-sub", text: "WHITE WINS" });
    const goBtns = el("div", { class: "gameover-btns" });
    goBtns.append(
      button("REVIEW GAME", () => { audio.play("ui"); this.hideGameOver(); actions.onReview(); }, "btn btn-gold"),
      button("NEW GAME", () => { audio.play("ui"); this.hideGameOver(); actions.onNewGame(); }),
      button("MAIN MENU", () => { audio.play("ui"); this.hideGameOver(); actions.onMainMenu(); }),
    );
    goBox.append(this.gameOverTitle, this.gameOverSub, goBtns);
    this.gameOverOverlay.append(goBox);
    this.gameOverOverlay.hidden = true;

    // Review bar.
    this.reviewBar = el("div", { class: "review-bar" });
    this.reviewBar.append(
      button("⏮", () => actions.onReviewJump(0), "btn btn-icon"),
      button("◀", () => actions.onReviewStep(-1), "btn btn-icon"),
      (this.reviewPos = el("div", { class: "review-pos", text: "0 / 0" })),
      button("▶", () => actions.onReviewStep(1), "btn btn-icon"),
      button("⏭", () => actions.onReviewJump("end"), "btn btn-icon"),
      button("EXIT REVIEW", () => actions.onReviewExit(), "btn btn-small"),
    );
    this.reviewBar.hidden = true;

    this.root.append(
      this.blackPlate,
      this.whitePlate,
      status,
      panel,
      this.promoOverlay,
      this.confirmOverlay,
      this.gameOverOverlay,
      this.reviewBar,
    );

    window.addEventListener("keydown", this.onKey);
  }

  private onKey = (e: KeyboardEvent): void => {
    if (this.reviewBar.hidden) return;
    if (e.key === "ArrowLeft") this.actions.onReviewStep(-1);
    if (e.key === "ArrowRight") this.actions.onReviewStep(1);
    if (e.key === "Home") this.actions.onReviewJump(0);
    if (e.key === "End") this.actions.onReviewJump("end");
    if (e.key === "Escape") this.actions.onReviewExit();
  };

  destroy(): void {
    window.removeEventListener("keydown", this.onKey);
    this.root.remove();
  }

  // -------------------------------------------------- GameUIDelegate

  onHistoryChanged(rows: { num: number; white?: string; black?: string }[], ply: number): void {
    clear(this.moveList);
    for (const row of rows) {
      const r = el("div", { class: "move-row" });
      r.append(el("span", { class: "move-num", text: `${row.num}.` }));
      const w = el("span", { class: "move-san", text: row.white ?? "" });
      const b = el("span", { class: "move-san", text: row.black ?? "" });
      const whiteIdx = (row.num - 1) * 2 + 1;
      const blackIdx = whiteIdx + 1;
      if (whiteIdx === ply) w.classList.add("current");
      if (blackIdx === ply) b.classList.add("current");
      r.append(w, b);
      this.moveList.append(r);
    }
    this.moveList.scrollTop = this.moveList.scrollHeight;
  }

  onClocks(w: number, b: number, active: Color | null): void {
    this.whiteClock.textContent = formatClock(w);
    this.blackClock.textContent = formatClock(b);
    this.whitePlate.classList.toggle("active", active === "w");
    this.blackPlate.classList.toggle("active", active === "b");
    const lowMs = Math.min(w < 0 ? Infinity : w, b < 0 ? Infinity : b);
    const now = performance.now();
    if (lowMs >= 0 && lowMs < 10000 && now - this.lastClockWarn > 1000) {
      this.lastClockWarn = now;
      audio.play("tick");
    }
  }

  onTurn(color: Color, label: string): void {
    this.turnLabel.textContent = label;
    this.turnLabel.classList.toggle("white-turn", color === "w");
  }

  onThinking(thinking: boolean, who?: string): void {
    this.thinking.hidden = !thinking;
    if (who) this.thinking.textContent = `${who} THINKING…`;
  }

  onCheckBanner(show: boolean, color?: Color): void {
    this.checkBanner.hidden = !show;
    if (show && color) {
      this.checkBanner.textContent = `CHECK — ${color === "w" ? "WHITE" : "BLACK"} KING`;
    }
  }

  onGameOver(result: ResultInfo): void {
    const titles: Record<string, string> = {
      checkmate: "CHECKMATE",
      stalemate: "STALEMATE",
      timeout: "TIME OUT",
      draw: "DRAW",
    };
    this.gameOverTitle.textContent = titles[result.kind] ?? "GAME OVER";
    this.gameOverSub.textContent = describeResult(result);
    this.gameOverOverlay.hidden = false;
  }

  hideGameOver(): void {
    this.gameOverOverlay.hidden = true;
  }

  onReviewMode(active: boolean, ply: number, total: number): void {
    this.reviewBar.hidden = !active;
    this.reviewPos.textContent = `${ply} / ${total}`;
    if (active) this.hideGameOver();
  }

  showPromotion(color: Color, choose: (t: "q" | "r" | "b" | "n" | null) => void): void {
    clear(this.promoOverlay);
    void this.promoResolve;
    const box = el("div", { class: "dialog-box" });
    box.append(el("div", { class: "dialog-title", text: "PROMOTE" }));
    const opts = el("div", { class: "promo-options" });
    const glyphs = color === "w" ? { q: "♕", r: "♖", b: "♗", n: "♘" } : { q: "♛", r: "♜", b: "♝", n: "♞" };
    const names = { q: "QUEEN", r: "ROOK", b: "BISHOP", n: "KNIGHT" } as const;
    for (const t of ["q", "r", "b", "n"] as const) {
      const b = el("button", { class: "promo-btn", text: glyphs[t] });
      b.append(el("span", { class: "promo-label", text: names[t] }));
      b.addEventListener("click", () => choose(t));
      opts.append(b);
    }
    const cancel = button("CANCEL", () => choose(null), "btn btn-small");
    box.append(opts, cancel);
    this.promoOverlay.append(box);
    this.promoOverlay.hidden = false;
    this.promoResolve = choose;
  }

  hidePromotion(): void {
    this.promoOverlay.hidden = true;
    this.promoResolve = null;
  }

  showConfirm(onDecision: (ok: boolean) => void): void {
    clear(this.confirmOverlay);
    const box = el("div", { class: "dialog-box" });
    box.append(el("div", { class: "dialog-title", text: "CONFIRM MOVE" }));
    const btns = el("div", { class: "confirm-btns" });
    btns.append(
      button("PLAY IT", () => { this.confirmOverlay.hidden = true; onDecision(true); }, "btn btn-gold"),
      button("CANCEL", () => { this.confirmOverlay.hidden = true; onDecision(false); }),
    );
    box.append(btns);
    this.confirmOverlay.append(box);
    this.confirmOverlay.hidden = false;
  }

  setThemeAccent(accent: string): void {
    this.root.style.setProperty("--accent", accent);
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? "" : "none";
  }

  get settingsHint() {
    return settings;
  }
}
