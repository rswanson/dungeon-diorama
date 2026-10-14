import { describe, expect, it } from "vitest";
import { mergePositions } from "./positions.js";
import { LAYOUT, SCENE } from "./test-fixtures.js";

describe("mergePositions", () => {
  it("gives the scene layout when nothing is saved", () => {
    expect(mergePositions(SCENE, {})).toEqual(LAYOUT);
  });

  it("puts saved rows on top of the scene file, in scene order", () => {
    const merged = mergePositions(SCENE, { c: [1, 1], a: [0, 2] });
    expect(merged).toEqual({ a: [0, 2], b: [1, 0], c: [1, 1] });
    expect(Object.keys(merged)).toEqual(["a", "b", "c"]);
  });

  it("ignores a row for a sprite the scene does not have", () => {
    expect(mergePositions(SCENE, { orc: [1, 1] })).toEqual(LAYOUT);
  });

  it("ignores a row off the board", () => {
    expect(mergePositions(SCENE, { a: [3, 0], b: [1, -1] })).toEqual(LAYOUT);
  });

  it("ignores a row on the scene square of a sprite that did not move", () => {
    expect(mergePositions(SCENE, { a: [2, 2] })).toEqual(LAYOUT);
  });

  it("allows a row on a scene square that its sprite left", () => {
    expect(mergePositions(SCENE, { a: [1, 0], b: [1, 1] })).toEqual({
      a: [1, 0],
      b: [1, 1],
      c: [2, 2],
    });
  });

  it("keeps the first moved sprite in scene order when two share a square", () => {
    expect(mergePositions(SCENE, { c: [1, 1], b: [1, 1] })).toEqual({
      a: [0, 0],
      b: [1, 1],
      c: [2, 2],
    });
  });

  it("sends a sprite back again when a return takes its square", () => {
    // b is off the board, so it stands on [1, 0], and a cannot stand there.
    expect(mergePositions(SCENE, { a: [1, 0], b: [9, 9] })).toEqual(LAYOUT);
    // b loses [1, 1] to a and goes back to [1, 0]. Then c, which took the
    // square that b left, loses it to b and goes back to [2, 2].
    expect(mergePositions(SCENE, { a: [1, 1], b: [1, 1], c: [1, 0] })).toEqual({
      a: [1, 1],
      b: [1, 0],
      c: [2, 2],
    });
  });

  it("ignores a row that is not two whole numbers", () => {
    const rows = { a: [0.5, 1], b: [1] } as unknown as Record<
      string,
      [number, number]
    >;
    expect(mergePositions(SCENE, rows)).toEqual(LAYOUT);
  });
});
