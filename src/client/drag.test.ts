import { describe, expect, it } from "vitest";
import { BoardState } from "./board-state.js";
import { dropOutcome } from "./drag.js";

const state = (): BoardState =>
  new BoardState({ width: 4, depth: 3 }, [
    { id: "fighter", at: [0, 0] },
    { id: "goblin", at: [2, 1] },
  ]);

describe("dropOutcome", () => {
  it("moves the sprite to a free square", () => {
    expect(dropOutcome(state(), "fighter", { x: 3, z: 2 })).toEqual({
      kind: "move",
      to: { x: 3, z: 2 },
    });
  });

  it("sends the sprite back from a square another sprite holds", () => {
    expect(dropOutcome(state(), "fighter", { x: 2, z: 1 })).toEqual({
      kind: "back",
    });
  });

  it("sends the sprite back when the pointer is off the board", () => {
    expect(dropOutcome(state(), "fighter", null)).toEqual({ kind: "back" });
    expect(dropOutcome(state(), "fighter", { x: 4, z: 0 })).toEqual({
      kind: "back",
    });
  });

  it("sends the sprite back onto its own square", () => {
    expect(dropOutcome(state(), "fighter", { x: 0, z: 0 })).toEqual({
      kind: "back",
    });
  });
});
