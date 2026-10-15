import { describe, expect, it } from "vitest";
import { parseEntries, parseInput, parseTerm, rollTerm } from "./dice.js";

const BAD_DICE = (part: string, example = "/roll 1d20+5") =>
  `\`${part}\` is not valid dice. Use NdS±M, for example ${example}.`;
const BAD_NOTE_DICE = (part: string) => BAD_DICE(part, "[[1d20+5]]");
const UNKNOWN = "Unknown command. Use /roll 1d20+5 or [[1d20+5]].";

describe("parseInput", () => {
  it("reads /roll with one dice term in any case and with spaces", () => {
    expect(parseInput("  /roll 2d6+1  ")).toEqual({
      kind: "roll",
      parts: [{ term: { dice: "2d6+1", count: 2, sides: 6, modifier: 1 } }],
    });
    expect(parseInput("/ROLL 3D8 - 2")).toEqual({
      kind: "roll",
      parts: [{ term: { dice: "3d8-2", count: 3, sides: 8, modifier: -2 } }],
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
    // Exactly 500 characters, all inside the trimmed text, is valid.
    const atLimit = `/roll 1${" ".repeat(491)}d6`;
    expect(atLimit).toHaveLength(500);
    expect(parseInput(atLimit)).toEqual({
      kind: "roll",
      parts: [{ term: { dice: "1d6", count: 1, sides: 6, modifier: 0 } }],
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
      ["/rolls 1d6", UNKNOWN],
      ["/r 1d6", UNKNOWN],
      ["/note [[1d6]]", UNKNOWN],
      // In a note, the error names the text in the brackets. With no text in
      // them, or no `]]`, it names the text from the `[[`.
      ["I hit [[2d0]] hard", BAD_NOTE_DICE("2d0")],
      ["I hit [[ 1d6 to hit ]]", BAD_NOTE_DICE("1d6 to hit")],
      ["I hit [[]] hard", BAD_NOTE_DICE("[[]]")],
      ["I hit [[  ]] hard", BAD_NOTE_DICE("[[  ]]")],
      ["I hit [[1d6 hard", BAD_NOTE_DICE("[[1d6 hard")],
      ["[[1d4]] and [[1d6", BAD_NOTE_DICE("[[1d6")],
      ["[[1d4]]".repeat(11), "Use at most 10 [[...]] rolls in one message."],
    ];
    for (const [input, error] of errors) {
      expect(parseInput(input), input).toEqual({ kind: "error", error });
    }
  });

  it("gives a note with its text and [[...]] rolls in the order of the text", () => {
    const term = (dice: string) => parseTerm(dice)!;
    expect(parseInput(" I swing [[1d20+5]] for [[ D8 + 3 ]] ]] ")).toEqual({
      kind: "note",
      parts: [
        { text: "I swing " },
        { term: term("1d20+5") },
        { text: " for " },
        { term: term("1d8+3") },
        { text: " ]]" },
      ],
    });
    // A `]]` with no `[[` before it is text.
    expect(parseInput("a ]] b [[d6]]")).toEqual({
      kind: "note",
      parts: [{ text: "a ]] b " }, { term: term("1d6") }],
    });
    expect(parseInput("<b>I open the door</b>")).toEqual({
      kind: "note",
      parts: [{ text: "<b>I open the door</b>" }],
    });
    expect(parseInput("[[1d4]]".repeat(10))).toEqual({
      kind: "note",
      parts: Array.from({ length: 10 }, () => ({ term: term("1d4") })),
    });
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

describe("parseEntries", () => {
  const roll = {
    dice: "2d6+1",
    count: 2,
    sides: 6,
    modifier: 1,
    results: [3, 4],
    total: 8,
  };
  const entry = {
    id: 1,
    kind: "roll",
    at: "2026-10-14T12:00:00.000Z",
    parts: [{ text: "a" }, { roll }],
  };

  it("gives a valid list as it is", () => {
    expect(parseEntries([entry])).toEqual([entry]);
    expect(parseEntries([])).toEqual([]);
  });

  it("gives null for a bad shape", () => {
    expect(parseEntries(null)).toBeNull();
    expect(parseEntries({})).toBeNull();
    expect(parseEntries([{ ...entry, id: "1" }])).toBeNull();
    expect(parseEntries([{ ...entry, kind: "other" }])).toBeNull();
    expect(parseEntries([{ ...entry, parts: [{ roll: {} }] }])).toBeNull();
    expect(parseEntries([{ ...entry, parts: [{ text: 5 }] }])).toBeNull();
  });
});
