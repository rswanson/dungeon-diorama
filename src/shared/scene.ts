// The scene file format and its validation. The client and the server both use
// this module, so a scene file is valid in the same way for both.

/** A scene name is the file name in `public/scenes/` without `.json`. */
const SCENE_NAME = /^[a-z0-9-]{1,40}$/;

/** The largest board width and depth, in squares. */
const MAX_BOARD_SIDE = 64;

interface Material {
  name: string;
  /** The color of the top face, as `#rrggbb`. */
  top: string;
  /** The color of the side faces, as `#rrggbb`. */
  side: string;
}

export interface Board {
  width: number;
  depth: number;
  /** Each key is one character, which `tiles` uses. */
  materials: Record<string, Material>;
  /** `depth` rows of `width` characters `0`–`9`: the layers above the base layer. */
  heights: string[];
  /** `depth` rows of `width` characters, each a key in `materials`. */
  tiles: string[];
}

/** A square of the board, by its column and its row. */
export interface Square {
  x: number;
  z: number;
}

export interface SpriteSpec {
  id: string;
  name: string;
  image: string;
  /** The square `[x, z]`, 0-based. `x` goes along a row, `z` goes down the rows. */
  at: [number, number];
}

export interface Scene {
  version: 1;
  name: string;
  board: Board;
  sprites: SpriteSpec[];
}

type SceneResult =
  { ok: true; scene: Scene } | { ok: false; problems: string[] };

const COLOR = /^#[0-9a-fA-F]{6}$/;

export function isSceneName(name: string): boolean {
  return SCENE_NAME.test(name);
}

/** True when `value` is `[x, z]` with two whole numbers. */
export function isAt(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((n) => Number.isInteger(n))
  );
}

/** True when `square` is a whole-number square of a board of this size. */
export function onBoard(
  { width, depth }: { width: number; depth: number },
  { x, z }: Square,
): boolean {
  return (
    Number.isInteger(x) &&
    Number.isInteger(z) &&
    x >= 0 &&
    x < width &&
    z >= 0 &&
    z < depth
  );
}

/** The key of a square, `"x,z"`, for a set or a map of squares. */
export function squareKey({ x, z }: Square): string {
  return `${x},${z}`;
}

/** Reads the text of a scene file and validates it. */
export function parseScene(text: string): SceneResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, problems: ["The scene file is not valid JSON."] };
  }
  return validateScene(data);
}

/** Checks the shape of a scene and names each problem that it finds. */
export function validateScene(data: unknown): SceneResult {
  if (!isObject(data)) {
    return { ok: false, problems: ["The scene file must be a JSON object."] };
  }
  const problems: string[] = [];

  if (data.version !== 1) problems.push("version must be 1.");
  if (!isText(data.name) || data.name.trim() === "") {
    problems.push("name must be a text that is not empty.");
  }

  let width: number | undefined;
  let depth: number | undefined;
  if (isObject(data.board)) {
    ({ width, depth } = checkBoard(data.board, problems));
  } else {
    problems.push("board must be an object.");
  }

  if (Array.isArray(data.sprites)) {
    checkSprites(data.sprites, width, depth, problems);
  } else {
    problems.push("sprites must be an array.");
  }

  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, scene: data as unknown as Scene };
}

function checkBoard(
  board: Record<string, unknown>,
  problems: string[],
): { width?: number; depth?: number } {
  const width = checkSide(board.width, "board.width", problems);
  const depth = checkSide(board.depth, "board.depth", problems);
  const keys = checkMaterials(board.materials, problems);

  checkGrid("heights", board.heights, width, depth, problems, (char) =>
    char >= "0" && char <= "9"
      ? undefined
      : `"${char}" is not a height from 0 to 9`,
  );
  checkGrid("tiles", board.tiles, width, depth, problems, (char) =>
    // Without valid materials, each key check would only repeat that problem.
    keys === undefined || keys.has(char)
      ? undefined
      : `"${char}" is not a key in materials`,
  );
  return { width, depth };
}

function checkSide(
  value: unknown,
  label: string,
  problems: string[],
): number | undefined {
  if (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_BOARD_SIDE
  ) {
    return value;
  }
  problems.push(`${label} must be a whole number from 1 to ${MAX_BOARD_SIDE}.`);
  return undefined;
}

function checkMaterials(
  materials: unknown,
  problems: string[],
): Set<string> | undefined {
  if (!isObject(materials) || Object.keys(materials).length === 0) {
    problems.push("board.materials must be an object with one or more keys.");
    return undefined;
  }
  const keys = new Set<string>();
  for (const [key, material] of Object.entries(materials)) {
    // board.ts reads a tile key by string index, so a key is one UTF-16 unit.
    if (key.length !== 1) {
      problems.push(`materials key "${key}" must be one character.`);
      continue;
    }
    keys.add(key);
    if (!isObject(material)) {
      problems.push(`materials "${key}" must be an object.`);
      continue;
    }
    if (!isText(material.name)) {
      problems.push(`materials "${key}": name must be a text.`);
    }
    for (const face of ["top", "side"] as const) {
      const color = material[face];
      if (typeof color !== "string" || !COLOR.test(color)) {
        problems.push(
          `materials "${key}": ${face} must be a color like "#8a8a8a".`,
        );
      }
    }
  }
  // With no valid key, each tile key check would only repeat these problems.
  return keys.size === 0 ? undefined : keys;
}

function checkGrid(
  label: "heights" | "tiles",
  rows: unknown,
  width: number | undefined,
  depth: number | undefined,
  problems: string[],
  checkChar: (char: string) => string | undefined,
): void {
  if (!Array.isArray(rows)) {
    problems.push(`board.${label} must be an array of texts.`);
    return;
  }
  if (depth !== undefined && rows.length !== depth) {
    problems.push(
      `${label} has ${count(rows.length, "row")}; the board is ${depth} deep.`,
    );
  }
  rows.forEach((row: unknown, z) => {
    if (typeof row !== "string") {
      problems.push(`${label} row ${z} must be a text.`);
      return;
    }
    // Plain string indexing, the same way board.ts reads a row.
    if (width !== undefined && row.length !== width) {
      problems.push(
        `${label} row ${z} has ${count(row.length, "character")}; the board is ${width} wide.`,
      );
    }
    for (let x = 0; x < row.length; x++) {
      const problem = checkChar(row[x]);
      if (problem) problems.push(`${label} row ${z}, x ${x}: ${problem}.`);
    }
  });
}

function checkSprites(
  sprites: unknown[],
  width: number | undefined,
  depth: number | undefined,
  problems: string[],
): void {
  const idCounts = new Map<string, number>();
  /** The label of the sprite on each square, by "x,z". */
  const squares = new Map<string, string>();

  sprites.forEach((sprite, index) => {
    if (!isObject(sprite)) {
      problems.push(`sprites[${index}] must be an object.`);
      return;
    }
    const id = sprite.id;
    const hasId = isText(id);
    const label = hasId ? `sprite "${id}"` : `sprites[${index}]`;
    // Ids can repeat, so the square message names the index as well.
    const where = hasId ? `sprites[${index}] ("${id}")` : label;

    if (!hasId) {
      problems.push(`${label}: id must be a text that is not empty.`);
    } else {
      const n = (idCounts.get(id) ?? 0) + 1;
      idCounts.set(id, n);
      if (n === 2) problems.push(`Two or more sprites have the id "${id}".`);
    }

    if (!isText(sprite.name)) {
      problems.push(`${label}: name must be a text that is not empty.`);
    }
    if (!isText(sprite.image)) {
      problems.push(`${label}: image must be a text that is not empty.`);
    }

    const at = sprite.at;
    if (!isAt(at)) {
      problems.push(`${label}: at must be [x, z] with two whole numbers.`);
      return;
    }
    const [x, z] = at;
    if (width === undefined || depth === undefined) return;
    if (!onBoard({ width, depth }, { x, z })) {
      problems.push(
        `${label} at [${x}, ${z}] is off the ${width}x${depth} board.`,
      );
      return;
    }
    const key = squareKey({ x, z });
    const other = squares.get(key);
    if (other) {
      problems.push(`${other} and ${where} both stand on [${x}, ${z}].`);
    } else {
      squares.set(key, where);
    }
  });
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
