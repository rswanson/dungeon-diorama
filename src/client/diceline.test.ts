import { describe, expect, it } from "vitest";
import type { Roll } from "../shared/dice.js";
import { localTime, rollLine, type LineSegment } from "./diceline.js";

function roll(sides: number, modifier: number, results: number[]): Roll {
  const total = results.reduce((sum, n) => sum + n, modifier);
  return { dice: "", count: results.length, sides, modifier, results, total };
}

/** The line as text, with each styled piece as `<style:text>`. */
function show(line: LineSegment[]): string {
  return line
    .map(({ text, style }) => (style ? `<${style}:${text}>` : text))
    .join("");
}

describe("rollLine", () => {
  it("shows the dice, the modifier and the total in bold", () => {
    expect(show(rollLine(roll(6, 1, [4, 3])))).toBe("(4, 3) + 1 = <total:8>");
    expect(show(rollLine(roll(6, 0, [4, 3])))).toBe("(4, 3) = <total:7>");
    expect(show(rollLine(roll(6, -2, [4, 3])))).toBe("(4, 3) - 2 = <total:5>");
    expect(show(rollLine(roll(2, -1000, [1])))).toBe(
      "(<min:1>) - 1000 = <total:-999>",
    );
  });

  it("makes the highest face green and a 1 red", () => {
    expect(show(rollLine(roll(20, 0, [20, 1, 7])))).toBe(
      "(<max:20>, <min:1>, 7) = <total:28>",
    );
    expect(show(rollLine(roll(2, 0, [2, 1])))).toBe(
      "(<max:2>, <min:1>) = <total:3>",
    );
  });
});

describe("localTime", () => {
  it("gives the local hours and minutes", () => {
    expect(localTime(new Date(2026, 9, 14, 8, 5).toISOString())).toBe("08:05");
    expect(localTime(new Date(2026, 9, 14, 23, 59).toISOString())).toBe(
      "23:59",
    );
  });
});
