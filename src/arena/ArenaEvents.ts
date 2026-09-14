// ---------------------------------------------------------------------------
// CHESS ARENA — centralized game event system.
//
// The chess engine decides what happened; these events describe it; the
// 3D world, camera, audio and UI all subscribe and react independently.
// ---------------------------------------------------------------------------

import { Color, Move, PieceType, Square } from "../chess/types";

export interface MoveEventPayload {
  type: "move";
  move: Move;
}

export interface CaptureEventPayload {
  type: "capture";
  move: Move;
  attackerColor: Color;
  capturedType: PieceType;
  capturedSquare: Square;
}

export interface CastleEventPayload {
  type: "castle";
  move: Move;
  side: "K" | "Q";
  color: Color;
}

export interface PromotionEventPayload {
  type: "promotion";
  move: Move;
  fromType: PieceType;
  toType: PieceType;
  color: Color;
  square: Square;
}

export interface CheckEventPayload {
  type: "check";
  color: Color; // color of the king in check
  kingSquare: Square;
  movedTo: Square;
}

export interface CheckmateEventPayload {
  type: "checkmate";
  loser: Color;
  winner: Color;
  kingSquare: Square;
  finalMove: Move;
}

export type DrawReason =
  | "stalemate"
  | "fifty-move rule"
  | "threefold repetition"
  | "insufficient material"
  | "timeout"
  | "agreement";

export interface DrawEventPayload {
  type: "draw";
  reason: DrawReason;
  /** When a player loses on time, this is that player's color. */
  loser?: Color;
}

export interface GameStartEventPayload {
  type: "gamestart";
  startFen: string;
  mode: string;
}

export interface GameEndEventPayload {
  type: "gameend";
  result: string;
}

export type ChessEvent =
  | MoveEventPayload
  | CaptureEventPayload
  | CastleEventPayload
  | PromotionEventPayload
  | CheckEventPayload
  | CheckmateEventPayload
  | DrawEventPayload
  | GameStartEventPayload
  | GameEndEventPayload;

export type EventType = ChessEvent["type"];
type Handler = (event: ChessEvent) => void;

export class EventBus {
  private handlers = new Map<EventType, Set<Handler>>();
  private anyHandlers = new Set<Handler>();

  on(type: EventType, handler: (event: ChessEvent) => void): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  onAny(handler: Handler): () => void {
    this.anyHandlers.add(handler);
    return () => this.anyHandlers.delete(handler);
  }

  emit(event: ChessEvent): void {
    const set = this.handlers.get(event.type);
    if (set) for (const h of [...set]) h(event);
    for (const h of [...this.anyHandlers]) h(event);
  }

  clear(): void {
    this.handlers.clear();
    this.anyHandlers.clear();
  }
}
