// ---------------------------------------------------------------------------
// Menu screens: main menu, mode setup, theme selector.
// ---------------------------------------------------------------------------

import { el, button, clear } from "./dom";
import { ThemeRegistry } from "../themes/registry";
import { settings, CLOCK_PRESETS } from "../settings";
import { Difficulty } from "../ai/Search";
import { Color } from "../chess/types";
import { GameMode } from "../game/GameController";
import { audio } from "../audio/AudioManager";

export interface PendingGame {
  mode: GameMode;
  humanColor: Color;
  difficulty: Difficulty;
  clockPreset: string;
  startFen?: string;
}

type MenuButton = { label: string; sub?: string; action: () => void };

export function buildMainMenu(
  host: HTMLElement,
  handlers: {
    play: (mode: GameMode) => void;
    sandbox: () => void;
    settings: () => void;
    themes: () => void;
  },
): void {
  clear(host);
  const wrap = el("div", { class: "screen menu-screen" });
  const title = el("div", { class: "menu-title" });
  title.append(
    el("div", { class: "menu-kicker", text: "EVERY MOVE CHANGES THE BATTLEFIELD" }),
    el("h1", { text: "CHESS ARENA" }),
  );
  const btns = el("div", { class: "menu-btns" });
  const items: MenuButton[] = [
    { label: "PLAY VS AI", sub: "Face the machine", action: () => handlers.play("vsai") },
    { label: "LOCAL 2 PLAYER", sub: "Share the battlefield", action: () => handlers.play("local") },
    { label: "AI VS AI", sub: "Watch the war unfold", action: () => handlers.play("aivai") },
    { label: "SANDBOX", sub: "Forge your own position", action: () => handlers.sandbox },
    { label: "SETTINGS", action: () => handlers.settings() },
  ];
  for (const item of items) {
    const b = el("button", { class: "menu-btn" });
    b.append(el("span", { class: "menu-btn-label", text: item.label }));
    if (item.sub) b.append(el("span", { class: "menu-btn-sub", text: item.sub }));
    b.addEventListener("click", () => {
      audio.unlock();
      audio.play("ui");
      item.action();
    });
    btns.append(b);
  }

  const themeMeta = ThemeRegistry.get(settings.get().defaults.theme);
  const themeName = themeMeta ? new themeMeta().meta().name : "MEDIEVAL CASTLE";
  const themeRow = el("button", { class: "theme-row" });
  themeRow.append(
    el("span", { text: "ARENA: " }),
    el("b", { text: themeName }),
    el("span", { class: "theme-row-change", text: " CHANGE ▸" }),
  );
  themeRow.addEventListener("click", () => {
    audio.play("ui");
    handlers.themes();
  });

  wrap.append(title, btns, themeRow, el("div", { class: "menu-foot", text: "Standard FIDE rules · 6 cinematic arenas" }));
  host.append(wrap);
}

// ----------------------------------------------------------------- setup

export function buildSetupScreen(
  host: HTMLElement,
  mode: GameMode,
  onBack: () => void,
  onContinue: (pending: PendingGame) => void,
): void {
  clear(host);
  const d = settings.get().defaults;
  const wrap = el("div", { class: "screen setup-screen" });
  const panel = el("div", { class: "setup-panel" });
  panel.append(el("h2", { text: mode === "vsai" ? "PLAY VS AI" : mode === "local" ? "LOCAL 2 PLAYER" : "AI VS AI" }));

  let color: Color | "random" = d.playerColor;
  let difficulty: Difficulty = d.difficulty;
  let clockPreset = d.clockPreset;

  const group = (title: string, options: { id: string; label: string }[], current: string, onPick: (id: string) => void) => {
    const g = el("div", { class: "setup-group" });
    g.append(el("div", { class: "setup-group-title", text: title }));
    const row = el("div", { class: "setup-row" });
    const btns = new Map<string, HTMLButtonElement>();
    for (const o of options) {
      const b = button(o.label, () => {
        audio.play("ui");
        onPick(o.id);
        btns.forEach((x) => x.classList.remove("chosen"));
        b.classList.add("chosen");
      }, "btn btn-option");
      if (o.id === current) b.classList.add("chosen");
      btns.set(o.id, b);
      row.append(b);
    }
    g.append(row);
    return g;
  };

  if (mode === "vsai") {
    panel.append(
      group("PLAY AS", [
        { id: "w", label: "WHITE" },
        { id: "b", label: "BLACK" },
        { id: "random", label: "RANDOM" },
      ], color, (id) => (color = id as Color | "random")),
    );
  }
  if (mode !== "local") {
    panel.append(
      group(mode === "aivai" ? "AI STRENGTH" : "DIFFICULTY", [
        { id: "easy", label: "EASY" },
        { id: "medium", label: "MEDIUM" },
        { id: "hard", label: "HARD" },
      ], difficulty, (id) => (difficulty = id as Difficulty)),
    );
  }
  panel.append(
    group(
      "CHESS CLOCK",
      CLOCK_PRESETS.map((p) => ({ id: p.id, label: p.label })),
      clockPreset,
      (id) => (clockPreset = id),
    ),
  );

  const nav = el("div", { class: "setup-nav" });
  nav.append(
    button("◂ BACK", () => { audio.play("ui"); onBack(); }),
    button("CONTINUE ▸", () => {
      audio.play("ui");
      settings.update((s) => {
        s.defaults.playerColor = color;
        s.defaults.difficulty = difficulty;
        s.defaults.clockPreset = clockPreset;
      });
      let humanColor: Color = "w";
      if (mode === "vsai") {
        humanColor = color === "random" ? (Math.random() < 0.5 ? "w" : "b") : color;
      }
      onContinue({ mode, humanColor, difficulty, clockPreset });
    }, "btn btn-gold"),
  );
  panel.append(nav);
  wrap.append(panel);
  host.append(wrap);
}

// ------------------------------------------------------------ themes

export function buildThemeBrowser(
  host: HTMLElement,
  opts: {
    onBack: () => void;
    onStart?: (pending: PendingGame) => void;
    pending?: PendingGame;
  },
): void {
  clear(host);
  const wrap = el("div", { class: "screen theme-screen" });
  wrap.append(el("h2", { class: "theme-title", text: "CHOOSE YOUR BATTLEFIELD" }));
  const grid = el("div", { class: "theme-grid" });
  let chosen = settings.get().defaults.theme;

  const cards = new Map<string, HTMLElement>();
  for (const { id, meta } of ThemeRegistry.metas()) {
    const card = el("button", { class: "theme-card" });
    const preview = el("div", { class: "theme-preview" });
    preview.style.background = meta.preview;
    preview.append(el("div", { class: "theme-preview-name", text: meta.name.split(" ")[0] }));
    card.append(preview);
    card.append(el("div", { class: "theme-card-name", text: meta.name }));
    card.append(el("div", { class: "theme-card-tag", text: meta.tagline }));
    card.append(el("div", { class: "theme-card-desc", text: meta.description }));
    card.addEventListener("click", () => {
      audio.unlock();
      audio.play("ui");
      audio.startAmbient(id); // ambient preview while browsing arenas
      chosen = id;
      cards.forEach((c) => c.classList.remove("chosen"));
      card.classList.add("chosen");
    });
    if (id === chosen) card.classList.add("chosen");
    cards.set(id, card);
    grid.append(card);
  }
  wrap.append(grid);

  const nav = el("div", { class: "setup-nav" });
  nav.append(button("◂ BACK", () => { audio.play("ui"); opts.onBack(); }));
  if (opts.onStart && opts.pending) {
    nav.append(
      button("ENTER THE ARENA ▸", () => {
        audio.play("ui");
        settings.update((s) => (s.defaults.theme = chosen));
        opts.onStart!(opts.pending!);
      }, "btn btn-gold"),
    );
  } else {
    nav.append(
      button("SAVE ARENA", () => {
        audio.play("ui");
        settings.update((s) => (s.defaults.theme = chosen));
        opts.onBack();
      }, "btn btn-gold"),
    );
  }
  wrap.append(nav);
  host.append(wrap);
}
