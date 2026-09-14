// ---------------------------------------------------------------------------
// CHESS ARENA — boot & screen routing.
// ---------------------------------------------------------------------------

import "./styles.css";
import { ChessGame } from "./chess/ChessGame";
import { Arena } from "./arena/Arena";
import { GameController } from "./game/GameController";
import { GameHUD } from "./ui/GameHUD";
import { buildMainMenu, buildSetupScreen, buildThemeBrowser, PendingGame } from "./ui/Screens";
import { buildSandbox } from "./ui/SandboxEditor";
import { openSettings } from "./ui/SettingsModal";
import { ThemeRegistry } from "./themes/registry";
import { settings, clockPreset } from "./settings";
import { audio } from "./audio/AudioManager";
import { GameMode } from "./game/GameController";

const app = document.getElementById("app")!;
const fatal = document.getElementById("fatal-error");

function showFatal(msg: string): void {
  if (fatal) {
    fatal.hidden = false;
    const p = document.getElementById("fatal-error-msg");
    if (p) p.textContent = msg;
  }
}

async function boot(): Promise<void> {
  document.body.classList.toggle("high-contrast", settings.get().accessibility.highContrast);

  // --- Arena -----------------------------------------------------------
  const arenaHost = document.createElement("div");
  arenaHost.id = "arena-root";
  app.append(arenaHost);

  const screensHost = document.createElement("div");
  screensHost.id = "screens";
  app.append(screensHost);

  const arena = new Arena(arenaHost);
  arena.onWebGLFail = showFatal;
  try {
    arena.init();
  } catch {
    showFatal("WebGL is not available, so the 3D arena cannot start. Try a different browser or enable hardware acceleration.");
    return;
  }

  const controller = new GameController(arena);

  // Event bus: theme reacts, audio reacts, screen shakes.
  controller.bus.onAny((ev) => {
    arena.theme?.handleEvent(ev);
    switch (ev.type) {
      case "move": audio.play("move"); break;
      case "capture": {
        audio.play("capture");
        maybeShake(1);
        break;
      }
      case "castle": audio.play("castle"); break;
      case "promotion": audio.play("promote"); break;
      case "check": {
        audio.play("check");
        audio.setTension(1);
        break;
      }
      case "gamestart": audio.setTension(0); break;
      default: break;
    }
  });
  // Tension relaxes once a move lands without check.
  controller.bus.on("move", () => audio.setTension(0));

  let shakeUntil = 0;
  function maybeShake(power: number): void {
    const s = settings.get();
    if (!s.accessibility.screenShake || s.accessibility.reducedMotion) return;
    shakeUntil = performance.now() + 260;
    const el = arena.renderer.domElement;
    const step = () => {
      const remain = shakeUntil - performance.now();
      if (remain <= 0) {
        el.style.transform = "";
        return;
      }
      const a = (remain / 260) * 3 * power;
      el.style.transform = `translate(${(Math.random() - 0.5) * a}px, ${(Math.random() - 0.5) * a}px)`;
      requestAnimationFrame(step);
    };
    step();
  }

  // --- HUD --------------------------------------------------------------
  const hud = new GameHUD({
    onUndo: () => controller.undo(),
    onFlip: () => controller.flipBoard(),
    onSettings: () => openSettings(app, arena, () => {}),
    onExit: () => showMenu(),
    onNewGame: () => showSetup(controller.config.mode),
    onReview: () => controller.enterReview(),
    onMainMenu: () => showMenu(),
    onReviewStep: (d) => controller.reviewStep(d),
    onReviewJump: (t) => controller.reviewJump(t),
    onReviewExit: () => {
      controller.exitReview();
      if (controller.result) hud.onGameOver(controller.result);
    },
  });
  app.append(hud.root);
  hud.setVisible(false);
  controller.setUI(hud);

  // --- screens ----------------------------------------------------------
  let cleanupSandbox: (() => void) | null = null;
  let currentMode: GameMode = "vsai";

  function showMenu(): void {
    cleanupSandbox?.();
    cleanupSandbox = null;
    controller.deactivate();
    hud.setVisible(false);
    hud.hideGameOver();
    buildMainMenu(screensHost, {
      play: (mode) => {
        currentMode = mode;
        showSetup(mode);
      },
      sandbox: () => showSandbox(),
      settings: () => openSettings(app, arena, () => {}),
      themes: () => showThemeBrowser(),
    });
  }

  function showSetup(mode: GameMode): void {
    buildSetupScreen(
      screensHost,
      mode,
      () => showMenu(),
      (pending) => showThemeBrowser(pending),
    );
  }

  function showThemeBrowser(pending?: PendingGame): void {
    buildThemeBrowser(screensHost, {
      onBack: () => {
        if (pending) showSetup(pending.mode);
        else showMenu();
        void applySettingsTheme();
      },
      onStart: pending ? (p) => void startGame(p) : undefined,
      pending,
    });
  }

  function showSandbox(): void {
    cleanupSandbox = buildSandbox(
      screensHost,
      arena,
      () => showMenu(),
      (pending) => void startGame(pending),
    );
    arena.faceSide(true);
  }

  async function startGame(pending: PendingGame): Promise<void> {
    cleanupSandbox?.();
    cleanupSandbox = null;
    screensHost.innerHTML = "";
    hud.setVisible(true);
    hud.hideGameOver();
    const preset = clockPreset(pending.clockPreset);
    await applySettingsTheme();
    await controller.start({
      mode: pending.mode,
      humanColor: pending.humanColor,
      difficulty: pending.difficulty,
      clock: preset.baseMin > 0 ? { baseMin: preset.baseMin, incSec: preset.incSec } : null,
      startFen: pending.startFen,
    });
    const themeMeta = ThemeRegistry.get(arena.getThemeId());
    if (themeMeta) hud.setThemeAccent(new themeMeta().meta().accent);
  }

  async function applySettingsTheme(): Promise<void> {
    const id = settings.get().defaults.theme;
    if (arena.getThemeId() !== id) {
      await arena.setTheme(id);
      // Re-sync visuals from current game state.
      arena.syncFromGame(controller.game);
    } else {
      audio.startAmbient(id); // settle ambience back to the chosen arena
    }
  }

  // --- ambient loop: menu camera drift + clocks ---------------------------
  let last = performance.now();
  const tick = () => {
    requestAnimationFrame(tick);
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const menuish = screensHost.querySelector(".menu-screen, .setup-screen, .theme-screen");
    if (menuish) {
      // Gentle showcase orbit behind the menus.
      arena.cameraCtrl.rotate(dt * 9, 0);
    }
    controller.tickClocks();
    controller.refreshClocks();
  };
  requestAnimationFrame(tick);

  // --- audio unlock on first gesture --------------------------------------
  const unlock = () => {
    audio.unlock();
    audio.applyVolumes();
  };
  window.addEventListener("pointerdown", unlock, { once: false });
  window.addEventListener("keydown", unlock, { once: true });

  // --- initial state ------------------------------------------------------
  await arena.setTheme(settings.get().defaults.theme);
  arena.syncFromGame(new ChessGame());
  showMenu();
}

boot().catch((e) => {
  console.error(e);
  showFatal("CHESS ARENA failed to start: " + String(e?.message ?? e));
});
