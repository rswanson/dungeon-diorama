import { describe, expect, it } from "vitest";
import { parseInput, parseTerm, rollTerm } from "./dice.js";

const BAD_DICE = (dice: string) =>
  `\`${dice}\` is not valid dice. Use NdS±M, for example /roll 1d20+5.`;

describe("parseInput", () => {
  it("reads /roll with one dice term in any case and with spaces", () => {
    expect(parseInput("  /roll 2d6+1  ")).toEqual({
      kind: "roll",
      term: { dice: "2d6+1", count: 2, sides: 6, modifier: 1 },
    });
    expect(parseInput("/ROLL 3D8 - 2")).toEqual({
      kind: "roll",
      term: { dice: "3d8-2", count: 3, sides: 8, modifier: -2 },
    });
  });

  it("gives the normal form of the dice", () => {
    const dice = (text: string) => parseTerm(text)?.dice;
    expect(dice("2D6 + 0")).toBe("2d6");
    expect(dice("d20")).toBe("1d20");
    expect(dice("1d4 -0")).toBe("1d4");
    expect(dice("02d6+05")).toBe("2d6+5");
  });

  it("takes the limits of the dice term and refuses the values past them", () => {
    for (const valid of ["1d2", "d20", "100d100", "1d6+1000", "1d6-1000"]) {
      expect(parseTerm(valid), valid).not.toBeNull();
    }
    for (const bad of ["0d6", "101d6", "1d1", "1d101", "1d6+1001", "1 0d6"]) {
      expect(parseTerm(bad), bad).toBeNull();
    }
  });

  it("gives the error of each bad input", () => {
    // Exactly 500 characters is valid.
    expect(parseInput(`/roll 1d6${" ".repeat(491)}`)).toEqual({
      kind: "roll",
      term: { dice: "1d6", count: 1, sides: 6, modifier: 0 },
    });
    expect(parseInput(`/roll ${"1".repeat(495)}`)).toEqual({
      kind: "error",
      error: "Use at most 500 characters.",
    });
    const errors: [string, string][] = [
      ["/roll", "Give the dice, for example /roll 1d20+5."],
      ["/roll   ", "Give the dice, for example /roll 1d20+5."],
      ["/roll 2d0", BAD_DICE("2d0")],
      ["/roll 1d6 to hit", BAD_DICE("1d6 to hit")],
      ["/roll 1d6 [[1d4]]", BAD_DICE("1d6 [[1d4]]")],
      ["/roll 1d8+2d6", BAD_DICE("1d8+2d6")],
      ["/rolls 1d6", "Unknown command. Use /roll 1d20+5."],
      ["/r 1d6", "Unknown command. Use /roll 1d20+5."],
      ["I open the door", "Start with /roll, for example /roll 1d20+5."],
    ];
    for (const [input, error] of errors) {
      expect(parseInput(input), input).toEqual({ kind: "error", error });
    }
  });

  it("gives no error for an empty input", () => {
    expect(parseInput("")).toEqual({ kind: "empty" });
    expect(parseInput("   ")).toEqual({ kind: "empty" });
  });
});

describe("rollTerm", () => {
  it("rolls each die with the random source and adds the modifier", () => {
    const faces = [4, 3];
    const sides: number[] = [];
    const roll = rollTerm(
      { dice: "2d6-10", count: 2, sides: 6, modifier: -10 },
      (s) => {
        sides.push(s);
        return faces.shift()!;
      },
    );
    expect(sides).toEqual([6, 6]);
    expect(roll).toEqual({
      dice: "2d6-10",
      count: 2,
      sides: 6,
      modifier: -10,
      results: [4, 3],
      total: -3,
    });
  });
});
