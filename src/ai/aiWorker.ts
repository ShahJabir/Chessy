// ---------------------------------------------------------------------------
// AI Web Worker — keeps heavy search off the main thread so the battlefield
// keeps breathing while the AI thinks.
// ---------------------------------------------------------------------------

import { ChessGame } from "../chess/ChessGame";
import { Difficulty, searchBestMove } from "./Search";

export interface AiRequest {
  id: number;
  fen: string;
  difficulty: Difficulty;
}

self.onmessage = (e: MessageEvent<AiRequest>) => {
  const { id, fen, difficulty } = e.data;
  try {
    const game = new ChessGame(fen);
    const report = searchBestMove(game, difficulty);
    if (!report) {
      (self as unknown as Worker).postMessage({ id, error: "no-legal-moves" });
      return;
    }
    (self as unknown as Worker).postMessage({
      id,
      move: {
        from: report.move.from,
        to: report.move.to,
        promotion: report.move.promotion ?? null,
      },
      score: report.score,
      depth: report.depthReached,
      nodes: report.nodes,
      timeMs: report.timeMs,
    });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
