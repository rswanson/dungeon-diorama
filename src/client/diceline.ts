import { formatModifier, type Roll } from "../shared/dice.js";

/**
 * A piece of the result line of a roll. `max` is a die that shows its highest
 * face (green), `min` a die that shows 1 (red), and `total` the total (bold).
 */
export interface LineSegment {
  text: string;
  style?: "max" | "min" | "total";
}

/**
 * The result line of a roll, for example `(4, 3) + 1 = 8`: the dice in
 * brackets, the modifier (none for 0, `- 2` for -2) and the total.
 */
export function rollLine(roll: Roll): LineSegment[] {
  const line: LineSegment[] = [{ text: "(" }];
  roll.results.forEach((die, i) => {
    if (i > 0) line.push({ text: ", " });
    const style = die === roll.sides ? "max" : die === 1 ? "min" : undefined;
    line.push(style ? { text: String(die), style } : { text: String(die) });
  });
  line.push(
    { text: `)${formatModifier(roll.modifier, " ")} = ` },
    { text: String(roll.total), style: "total" },
  );
  return line;
}

/** The local time of an ISO 8601 time, as `HH:MM`. */
export function localTime(iso: string): string {
  const at = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`;
}
