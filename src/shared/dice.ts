// The dice input parser and the roll. The client and the server both use
// them: the client parses before it sends, and the server parses again and
// rolls. See the "Dice notation" and "Input" sections of the dice roller spec.

/** The most characters (JavaScript string length) of one input. */
export const MAX_INPUT_LENGTH = 500;
const MAX_COUNT = 100;
const MIN_SIDES = 2;
const MAX_SIDES = 100;
const MAX_MODIFIER = 1000;
/** The most `[[...]]` rolls in one note. */
const MAX_NOTE_ROLLS = 10;
const NOTE_EXAMPLE = "[[1d20+5]]";

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

/** A part of a note before the roll: text, or the dice term of a `[[...]]`. */
export type NotePart = { text: string } | { term: DiceTerm };

/** What `parseInput` gives. A `/roll` gives one part: its dice term. */
export type ParsedInput =
  | { kind: "empty" }
  | { kind: "error"; error: string }
  | { kind: "roll" | "note"; parts: NotePart[] };

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
  return {
    dice: `${count}d${sides}${formatModifier(modifier)}`,
    count,
    sides,
    modifier,
  };
}

/**
 * A modifier as text: "" for 0, else its sign and its size, for example `+1`
 * or `-2`. `gap` goes on each side of the sign, so a gap of " " gives
 * ` + 1` and ` - 2`.
 */
export function formatModifier(modifier: number, gap = ""): string {
  if (modifier === 0) return "";
  return `${gap}${modifier > 0 ? "+" : "-"}${gap}${Math.abs(modifier)}`;
}

/**
 * Reads one line of the dice input, after it removes the spaces at its start
 * and end. It gives a roll, a note, an error message, or "empty" for an input
 * with no text (no error and no request).
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
      return badDice(dice, "/roll 1d20+5");
    }
    return { kind: "roll", parts: [{ term }] };
  }
  if (text.startsWith("/")) {
    return error("Unknown command. Use /roll 1d20+5 or [[1d20+5]].");
  }
  return parseNote(text);
}

/**
 * Reads a note: its text and its `[[...]]` rolls, in the order of the text. A
 * `]]` with no `[[` before it is text. For a bad `[[...]]`, the error names the
 * text in the brackets. When the brackets hold no text, or the `]]` is
 * missing, it names the text from the `[[` to the `]]` or to the end.
 */
function parseNote(text: string): ParsedInput {
  const parts: NotePart[] = [];
  const addText = (part: string) => {
    if (part !== "") parts.push({ text: part });
  };
  let rolls = 0;
  let at = 0;
  for (;;) {
    const open = text.indexOf("[[", at);
    if (open < 0) break;
    const close = text.indexOf("]]", open + 2);
    if (close < 0) return badDice(text.slice(open), NOTE_EXAMPLE);
    const dice = text.slice(open + 2, close).trim();
    if (dice === "") return badDice(text.slice(open, close + 2), NOTE_EXAMPLE);
    const term = parseTerm(dice);
    if (!term) return badDice(dice, NOTE_EXAMPLE);
    if (++rolls > MAX_NOTE_ROLLS) {
      return error(
        `Use at most ${MAX_NOTE_ROLLS} [[...]] rolls in one message.`,
      );
    }
    addText(text.slice(at, open));
    parts.push({ term });
    at = close + 2;
  }
  addText(text.slice(at));
  return { kind: "note", parts };
}

function badDice(part: string, example: string): ParsedInput {
  return error(
    `\`${part}\` is not valid dice. Use NdS±M, for example ${example}.`,
  );
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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRoll(value: unknown): value is Roll {
  return (
    isObject(value) &&
    typeof value.dice === "string" &&
    typeof value.count === "number" &&
    typeof value.sides === "number" &&
    typeof value.modifier === "number" &&
    typeof value.total === "number" &&
    Array.isArray(value.results) &&
    value.results.every((n) => typeof n === "number")
  );
}

function isPart(value: unknown): value is Part {
  return (
    isObject(value) && (typeof value.text === "string" || isRoll(value.roll))
  );
}

function isEntry(value: unknown): value is Entry {
  return (
    isObject(value) &&
    typeof value.id === "number" &&
    (value.kind === "roll" || value.kind === "note") &&
    typeof value.at === "string" &&
    Array.isArray(value.parts) &&
    value.parts.every(isPart)
  );
}

/**
 * Reads the `rolls` of the API's answer: an array of entries. It gives null
 * when the shape is wrong.
 */
export function parseEntries(data: unknown): Entry[] | null {
  return Array.isArray(data) && data.every(isEntry) ? data : null;
}
