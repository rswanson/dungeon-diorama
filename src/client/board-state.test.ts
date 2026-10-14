import { describe, expect, it } from "vitest";
import { BoardState } from "./board-state.js";

const SIZE = { width: 4, depth: 3 };
const state = (): BoardState =>
  new BoardState(SIZE, [
    { id: "fighter", at: [0, 0] },
    { id: "goblin", at: [2, 1] },
  ]);

describe("BoardState", () => {
  it("starts with the layout of the scene file", () => {
    const board = state();
    expect(board.squareOf("fighter")).toEqual({ x: 0, z: 0 });
    expect(board.occupant(2, 1)).toBe("goblin");
    expect(board.occupant(1, 1)).toBeNull();
    expect(board.squareOf("nobody")).toBeUndefined();
  });

  it("lets a sprite move to a free square", () => {
    const board = state();
    expect(board.canMove("fighter", { x: 3, z: 2 })).toBe(true);
    board.move("fighter", { x: 3, z: 2 });
    expect(board.squareOf("fighter")).toEqual({ x: 3, z: 2 });
    expect(board.occupant(0, 0)).toBeNull();
    expect(board.occupant(3, 2)).toBe("fighter");
  });

  it("does not let a sprite move to a square another sprite holds", () => {
    const board = state();
    expect(board.canMove("fighter", { x: 2, z: 1 })).toBe(false);
    expect(() => board.move("fighter", { x: 2, z: 1 })).toThrow();
    expect(board.squareOf("fighter")).toEqual({ x: 0, z: 0 });
  });

  it("does not let a sprite move off the board", () => {
    const board = state();
    for (const to of [
      { x: -1, z: 0 },
      { x: 4, z: 0 },
      { x: 0, z: 3 },
      { x: 0.5, z: 0 },
    ]) {
      expect(board.canMove("fighter", to)).toBe(false);
    }
  });

  it("lets a sprite stay on its own square", () => {
    const board = state();
    expect(board.canMove("fighter", { x: 0, z: 0 })).toBe(true);
    board.move("fighter", { x: 0, z: 0 });
    expect(board.squareOf("fighter")).toEqual({ x: 0, z: 0 });
  });

  it("does not move an unknown sprite", () => {
    expect(state().canMove("nobody", { x: 1, z: 1 })).toBe(false);
  });
});
