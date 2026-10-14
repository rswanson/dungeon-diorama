import { describe, expect, it } from "vitest";
import { parsePositions } from "./positions.js";

describe("parsePositions", () => {
  it("reads an object of squares", () => {
    expect(parsePositions({ a: [1, 2] })).toEqual({ a: [1, 2] });
  });

  it("gives null for a wrong shape", () => {
    expect(parsePositions(null)).toBeNull();
    expect(parsePositions([[1, 2]])).toBeNull();
    expect(parsePositions({ a: [1, "2"] })).toBeNull();
  });
});
