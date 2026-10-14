import { describe, expect, it } from "vitest";
import { frustum } from "./camera.js";

describe("frustum", () => {
  const board = { halfWidth: 10, halfHeight: 6 };

  it("fills a wide or a tall window, holds the board and keeps its center", () => {
    for (const aspect of [16 / 9, 390 / 844]) {
      const f = frustum(board, aspect, 1);
      expect(f.left).toBe(-f.right);
      expect(f.bottom).toBe(-f.top);
      expect((f.right - f.left) / (f.top - f.bottom)).toBeCloseTo(aspect);
      expect(f.right).toBeGreaterThanOrEqual(board.halfWidth);
      expect(f.top).toBeGreaterThanOrEqual(board.halfHeight);
      // One side fits the board exactly, so the board is as large as it can be.
      expect(
        Math.min(f.right - board.halfWidth, f.top - board.halfHeight),
      ).toBeCloseTo(0);
    }
  });
});
