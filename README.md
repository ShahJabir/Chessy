# CHESS ARENA

### Every Move Changes the Battlefield

A cinematic, fully playable **3D chess game for the browser**. Standard FIDE-style chess,
played inside a living battlefield: pieces fly and land with weight, captured pieces fall,
glitch or dissolve depending on the arena, kings pulse under threat, and checkmate triggers
a full cinematic sequence.

Built with **TypeScript + Three.js + Vite**. No paid assets — every model, texture and sound
is generated procedurally at runtime.

---

## Quick start

```bash
npm install
npm run dev        # development server → http://localhost:5173
```

Production:

```bash
npm run build
npm run preview
```

Tests (chess engine, AI, game controller):

```bash
npm test
```

---

## Game modes

| Mode              | Description                                                             |
| ----------------- | ----------------------------------------------------------------------- |
| **PLAY VS AI**    | Choose White / Black / Random and Easy / Medium / Hard difficulty       |
| **LOCAL 2 PLAYER**| Two players share one device                                            |
| **AI VS AI**      | Sit back and watch two engines fight over the arena                     |
| **SANDBOX**       | Edit positions directly on the 3D board, load/copy FEN, then play them  |

Optional chess clocks: Unlimited, 1+0, 3+0, 3+2, 5+0, 5+3, 10+0, 10+5, 15+10, 30+0
(countdown, increment, timeout with insufficient-material draws).

## The arenas

Six fully reactive battlefields, each with its own environment, lighting, materials,
ambient sound and event interpretation:

- **MEDIEVAL CASTLE** — torches turn red on check, victory banners unfurl at checkmate
- **CYBERPUNK NEON CITY** — rain, holograms, light trails, system-override checkmate
- **SPACE VOID ARENA** — star field, nebulae, captured units drift into the void
- **ANCIENT EGYPT** — pyramids, glowing glyphs, pieces crumble to sand
- **SAMURAI BATTLEFIELD** — cherry blossoms, stone lanterns, a blossom storm at mate
- **HORROR ABANDONED** — fog, candles, flickering lights, darkness at the end

## Controls

- **Click** a piece → legal squares appear (dots = quiet moves, rings = captures)
- **Click** a highlighted square → move (drag-and-drop also works)
- **Drag empty space** → orbit camera · **Wheel** → zoom
- **FLIP** → camera to the other side · **UNDO** · **SETTINGS**
- In review: **← / → / Home / End** keys step through the game

## Chess correctness

The engine (`src/chess/ChessGame.ts`) implements the complete rule set:

legal move generation, check, checkmate, stalemate, castling (with all rights and
through-check restrictions), en passant, promotion, threefold repetition, fifty-move rule,
insufficient material, FEN I/O, SAN with disambiguation, undo.

It is verified by **perft tests** (start position to depth 4 = 197,281 nodes, Kiwipete
depth 2 = 2,039) plus targeted tests for every special rule. The AI only ever chooses from
`legalMoves()` — an illegal move is structurally impossible.

## AI

Negamax with alpha-beta pruning, MVV-LVA move ordering, quiescence search, iterative
deepening with a time budget, piece-square tables, king-safety terms and per-difficulty
randomness. It runs in a **Web Worker** so the battlefield keeps breathing while it thinks
(with a safe main-thread fallback).

## Architecture

```
src/
├── main.ts               boot, screen routing, event wiring
├── settings.ts           persisted settings (localStorage)
├── chess/                ChessGame (engine), MoveHistory, types
├── ai/                   Evaluation, Search, ChessAI facade, aiWorker
├── arena/                Arena orchestrator, ArenaTheme interface, event bus
├── board/                Board3D, BoardCoordinates (square ↔ world conversion)
├── pieces/               PieceFactory (procedural geometry), Piece3D, animation
├── camera/               CameraController (clamped orbit), CinematicCamera
├── interaction/          raycasting, click & drag input
├── effects/              pooled particles, ambient fields, flicker lights
├── audio/                procedural WebAudio SFX, ambience, adaptive music
├── themes/               Medieval / Cyberpunk / Space / Egypt / Samurai / Horror
├── game/                 GameController (rules flow, clocks, AI, review)
└── ui/                   menus, HUD, theme selector, settings, sandbox
```

The design follows one strict rule: **the chess engine determines reality, the arena
visualizes it, the camera dramatizes it, the audio makes it felt.** Gameplay code never
reads state from the 3D scene, and the visual state can always be rebuilt from the engine
(`Arena.syncFromGame`), which is also what powers undo and game review.

Adding a new theme = implement the `ArenaTheme` interface (palette, piece materials,
environment, event hooks) and register it in `src/themes/registry.ts`.

## Settings

Graphics (quality, shadows, effects, anti-aliasing, pixel ratio), audio (master / music /
effects / ambience), gameplay (move indicators, confirm-move, animation speed, camera
effects) and accessibility (reduced motion, high contrast, screen-shake toggle). All
persisted to `localStorage`.
