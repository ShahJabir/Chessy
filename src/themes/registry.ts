// ---------------------------------------------------------------------------
// Theme registry — the single place that maps theme ids to theme classes.
// ---------------------------------------------------------------------------

import { ArenaTheme } from "../arena/ArenaTheme";
import { MedievalTheme } from "./MedievalTheme";
import { CyberpunkTheme } from "./CyberpunkTheme";
import { SpaceTheme } from "./SpaceTheme";
import { EgyptianTheme } from "./EgyptianTheme";
import { SamuraiTheme } from "./SamuraiTheme";
import { HorrorTheme } from "./HorrorTheme";

type ThemeCtor = new () => ArenaTheme;

const REGISTRY = new Map<string, ThemeCtor>([
  ["medieval", MedievalTheme],
  ["cyberpunk", CyberpunkTheme],
  ["space", SpaceTheme],
  ["egypt", EgyptianTheme],
  ["samurai", SamuraiTheme],
  ["horror", HorrorTheme],
]);

export const ThemeRegistry = {
  get(id: string): ThemeCtor | undefined {
    return REGISTRY.get(id);
  },
  ids(): string[] {
    return [...REGISTRY.keys()];
  },
  /** Instantiate every theme briefly to read metadata (for selectors). */
  metas() {
    return [...REGISTRY.entries()].map(([id, Ctor]) => ({ id, meta: new Ctor().meta() }));
  },
};
