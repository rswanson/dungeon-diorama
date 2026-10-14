import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isAt,
  isSceneName,
  onBoard,
  parseScene,
  squareKey,
  validateScene,
} from "./scene.js";

/** A small valid scene. Each test changes one part of it. */
function scene() {
  return {
    version: 1,
    name: "Test",
    board: {
      width: 3,
      depth: 2,
      materials: {
        s: { name: "stone", top: "#8a8a8a", side: "#5e5e5e" },
        g: { name: "grass", top: "#5f9e3a", side: "#6b4a2b" },
      },
      heights: ["012", "900"],
      tiles: ["ssg", "ggs"],
    },
    sprites: [
      {
        id: "fighter",
        name: "Fighter",
        image: "sprites/fighter.png",
        at: [0, 0],
      },
      { id: "orc", name: "Orc", image: "sprites/orc.png", at: [2, 1] },
    ],
  };
}

type Data = ReturnType<typeof scene>;
/** A scene that a test takes a field out of. */
type Loose = Record<string, unknown>;

function problemsOf(data: unknown): string[] {
  const result = validateScene(data);
  return result.ok ? [] : result.problems;
}

describe("isSceneName", () => {
  it("takes 1 to 40 of a-z, 0-9 and -", () => {
    expect(isSceneName("demo")).toBe(true);
    expect(isSceneName("goblin-warren-2")).toBe(true);
    expect(isSceneName("a".repeat(40))).toBe(true);

    expect(isSceneName("")).toBe(false);
    expect(isSceneName("a".repeat(41))).toBe(false);
    expect(isSceneName("Demo")).toBe(false);
    expect(isSceneName("../demo")).toBe(false);
    expect(isSceneName("demo.json")).toBe(false);
  });
});

describe("isAt, onBoard and squareKey", () => {
  it("takes two whole numbers only as [x, z]", () => {
    expect(isAt([1, 2])).toBe(true);
    expect(isAt([1, 2, 3])).toBe(false);
    expect(isAt([1.5, 2])).toBe(false);
    expect(isAt("1,2")).toBe(false);
  });

  it("takes only whole-number squares in the board", () => {
    const size = { width: 3, depth: 2 };
    expect(onBoard(size, { x: 0, z: 0 })).toBe(true);
    expect(onBoard(size, { x: 2, z: 1 })).toBe(true);
    for (const square of [
      { x: -1, z: 0 },
      { x: 3, z: 0 },
      { x: 0, z: 2 },
      { x: 0.5, z: 0 },
    ]) {
      expect(onBoard(size, square)).toBe(false);
    }
  });

  it("gives one key for each square", () => {
    expect(squareKey({ x: 1, z: 12 })).toBe("1,12");
    expect(squareKey({ x: 11, z: 2 })).toBe("11,2");
  });
});

describe("validateScene", () => {
  it("accepts a valid scene", () => {
    expect(validateScene(scene())).toEqual({ ok: true, scene: scene() });
  });

  it("accepts the demo scene file, which uses every height and four materials", () => {
    const text = readFileSync(
      new URL("../../public/scenes/demo.json", import.meta.url),
      "utf8",
    );
    const result = parseScene(text);
    expect(result.ok ? [] : result.problems).toEqual([]);
    if (!result.ok) return;

    const { board } = result.scene;
    expect([board.width, board.depth]).toEqual([16, 12]);
    expect(new Set(board.heights.join("")).size).toBe(10);
    const used = new Set(board.tiles.join(""));
    expect(
      Object.entries(board.materials)
        .filter(([key]) => used.has(key))
        .map(([, material]) => material.name)
        .sort(),
    ).toEqual(["dirt", "grass", "stone", "water"]);
  });

  it("names a wrong row count", () => {
    const data = scene();
    data.board.heights.pop();
    expect(problemsOf(data)).toEqual([
      "heights has 1 row; the board is 2 deep.",
    ]);
  });

  it("names a wrong row length", () => {
    const data = scene();
    data.board.tiles[1] = "gg";
    expect(problemsOf(data)).toEqual([
      "tiles row 1 has 2 characters; the board is 3 wide.",
    ]);
  });

  it("names a height character that is not 0-9", () => {
    const data = scene();
    data.board.heights[0] = "0a2";
    expect(problemsOf(data)).toEqual([
      'heights row 0, x 1: "a" is not a height from 0 to 9.',
    ]);
  });

  it("names an unknown material key", () => {
    const data = scene();
    data.board.tiles[1] = "gqs";
    expect(problemsOf(data)).toEqual([
      'tiles row 1, x 1: "q" is not a key in materials.',
    ]);
  });

  it("names a sprite off the board", () => {
    const data = scene();
    data.sprites[1].at = [3, 1];
    expect(problemsOf(data)).toEqual([
      'sprite "orc" at [3, 1] is off the 3x2 board.',
    ]);
  });

  it("names two sprites on one square", () => {
    const data = scene();
    data.sprites[1].at = [0, 0];
    expect(problemsOf(data)).toEqual([
      'sprites[0] ("fighter") and sprites[1] ("orc") both stand on [0, 0].',
    ]);
  });

  it("tells sprites apart by index when their ids repeat on one square", () => {
    const data = scene();
    data.sprites[1].id = "fighter";
    data.sprites[1].at = [0, 0];
    expect(problemsOf(data)).toEqual([
      'Two or more sprites have the id "fighter".',
      'sprites[0] ("fighter") and sprites[1] ("fighter") both stand on [0, 0].',
    ]);
  });

  it("names a material key that is not one UTF-16 unit", () => {
    const data = scene();
    Object.assign(data.board.materials, {
      "🪨": { name: "rock", top: "#8a8a8a", side: "#5e5e5e" },
    });
    expect(problemsOf(data)).toEqual([
      'materials key "🪨" must be one character.',
    ]);
  });

  it("skips the tile key check when no materials key is valid", () => {
    const data = scene();
    Object.assign(data.board, {
      materials: { ab: { name: "rock", top: "#8a8a8a", side: "#5e5e5e" } },
    });
    expect(problemsOf(data)).toEqual([
      'materials key "ab" must be one character.',
    ]);
  });

  it.each<[string, (data: Data) => void, string]>([
    ["version is missing", (d) => delete (d as Loose).version, "version"],
    ["version is wrong", (d) => Object.assign(d, { version: 2 }), "version"],
    ["name is missing", (d) => delete (d as Loose).name, "name"],
    ["name is blank", (d) => Object.assign(d, { name: "  " }), "name"],
    ["board is missing", (d) => delete (d as Loose).board, "board"],
    ["board is a text", (d) => Object.assign(d, { board: "x" }), "board"],
    ["sprites is missing", (d) => delete (d as Loose).sprites, "sprites"],
    [
      "sprites is an object",
      (d) => Object.assign(d, { sprites: {} }),
      "sprites",
    ],
    [
      "materials is empty",
      (d) => Object.assign(d.board, { materials: {} }),
      "board.materials",
    ],
    [
      "a material is a text",
      (d) => Object.assign(d.board.materials, { s: "x" }),
      'materials "s"',
    ],
    [
      "a material color is bad",
      (d) => Object.assign(d.board.materials.s, { top: "red" }),
      "top must be a color",
    ],
    [
      "a material side is missing",
      (d) => delete (d.board.materials.s as Loose).side,
      "side must be a color",
    ],
    [
      "at has one number",
      (d) => Object.assign(d.sprites[0], { at: [1] }),
      "at must be",
    ],
    [
      "at has a fraction",
      (d) => Object.assign(d.sprites[0], { at: [0.5, 0] }),
      "at must be",
    ],
    [
      "at is not an array",
      (d) => Object.assign(d.sprites[0], { at: "0,0" }),
      "at must be",
    ],
  ])("names the field when %s", (_case, change, field) => {
    const data = scene();
    change(data);
    const problems = problemsOf(data);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.some((problem) => problem.includes(field))).toBe(true);
  });

  it.each<[string, unknown]>([
    ["an array", []],
    ["null", null],
    ["a text", "scene"],
  ])("rejects JSON that is %s", (_case, data) => {
    expect(problemsOf(data)).toEqual(["The scene file must be a JSON object."]);
  });

  it("names a duplicate sprite id", () => {
    const data = scene();
    data.sprites[1].id = "fighter";
    expect(problemsOf(data)).toEqual([
      'Two or more sprites have the id "fighter".',
    ]);
  });

  it("names each problem of a scene with many", () => {
    const data = scene();
    data.board.heights[0] = "0x";
    data.board.tiles[0] = "ssz";
    data.sprites[0].at = [-1, 0];
    expect(problemsOf(data)).toEqual([
      "heights row 0 has 2 characters; the board is 3 wide.",
      'heights row 0, x 1: "x" is not a height from 0 to 9.',
      'tiles row 0, x 2: "z" is not a key in materials.',
      'sprite "fighter" at [-1, 0] is off the 3x2 board.',
    ]);
  });

  it("names a file that is not JSON", () => {
    expect(parseScene("{ not json")).toEqual({
      ok: false,
      problems: ["The scene file is not valid JSON."],
    });
  });
});
