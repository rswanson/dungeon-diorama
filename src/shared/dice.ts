// The dice input parser and the roll. The client and the server both use
// them: the client parses before it sends, and the server parses again and
// rolls. See the "Dice notation" and "Input" sections of the dice roller spec.

/** The most characters (JavaScript string length) of one input. */
export const MAX_INPUT_LENGTH = 500;
const MAX_COUNT = 100;
const MIN_SIDES = 2;
const MAX_SIDES = 100;
const MAX_MODIFIER = 1000;

/** A dice term `NdS±M`, with `dice` in its normal form, for example `2d6+1`. */
export interface DiceTerm {
  dice: string;
  count: number;
  sides: number;
  modifier: number;
}

/** A dice term with its rolled dice and its total. */
export interface Roll extends DiceTerm {
  results: number[];
  total: number;
}

/** A part of an entry: text, or a roll. */
export type Part = { text: string } | { roll: Roll };

/** A log entry, as the API gives it. */
export interface Entry {
  id: number;
  kind: "roll" | "note";
  /** The server time of the roll, in ISO 8601 UTC. */
  at: string;
  parts: Part[];
}

/** What `parseInput` gives. */
export type ParsedInput =
  | { kind: "empty" }
  | { kind: "error"; error: string }
  | { kind: "roll"; term: DiceTerm };

/** `[N]dS[±M]`, with spaces between the parts but not inside a number. */
const TERM = /^(\d+)?\s*d\s*(\d+)\s*(?:([+-])\s*(\d+))?$/i;
/** `/roll`, in any case, then a space or the end of the text. */
const ROLL_COMMAND = /^\/roll(?=\s|$)/i;

/** Reads one dice term, for example `2D6 + 1` or `d20`. It gives null for a bad term. */
export function parseTerm(text: string): DiceTerm | null {
  const match = TERM.exec(text);
  if (!match) return null;
  const count = match[1] === undefined ? 1 : Number(match[1]);
  const sides = Number(match[2]);
  const size = match[4] === undefined ? 0 : Number(match[4]);
  if (count < 1 || count > MAX_COUNT) return null;
  if (sides < MIN_SIDES || sides > MAX_SIDES) return null;
  if (size > MAX_MODIFIER) return null;
  const modifier = size === 0 ? 0 : match[3] === "-" ? -size : size;
  const sign =
    modifier > 0 ? `+${modifier}` : modifier < 0 ? `${modifier}` : "";
  return { dice: `${count}d${sides}${sign}`, count, sides, modifier };
}

/**
 * Reads one line of the dice input, after it removes the spaces at its start
 * and end. It gives a roll, an error message, or "empty" for an input with no
 * text (no error and no request).
 */
export function parseInput(input: string): ParsedInput {
  const text = input.trim();
  if (text === "") return { kind: "empty" };
  if (text.length > MAX_INPUT_LENGTH) {
    return error(`Use at most ${MAX_INPUT_LENGTH} characters.`);
  }
  const command = ROLL_COMMAND.exec(text);
  if (command) {
    const dice = text.slice(command[0].length).trim();
    if (dice === "") return error("Give the dice, for example /roll 1d20+5.");
    const term = parseTerm(dice);
    if (!term) {
      return error(
        `\`${dice}\` is not valid dice. Use NdS±M, for example /roll 1d20+5.`,
      );
    }
    return { kind: "roll", term };
  }
  if (text.startsWith("/")) return error("Unknown command. Use /roll 1d20+5.");
  return error("Start with /roll, for example /roll 1d20+5.");
}

function error(message: string): ParsedInput {
  return { kind: "error", error: message };
}

/**
 * Rolls `term`. `die(sides)` gives one die: a whole number from 1 to `sides`.
 * The server gives it `crypto.randomInt`.
 */
export function rollTerm(term: DiceTerm, die: (sides: number) => number): Roll {
  const results = Array.from({ length: term.count }, () => die(term.sides));
  const total = results.reduce((sum, n) => sum + n, term.modifier);
  return { ...term, results, total };
}
