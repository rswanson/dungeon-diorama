import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { isSceneName, parseScene, type Scene } from "../shared/scene.js";

/** A scene file that exists but does not pass the validation. */
export class SceneFileError extends Error {}

/**
 * The scene files in `dir` (`<name>.json`), read with the same validation as
 * the client. It keeps each scene until its file changes.
 */
export class SceneFiles {
  private readonly cache = new Map<string, { mtimeMs: number; scene: Scene }>();

  constructor(private readonly dir: string) {}

  /** The scene `name`, or null when no file has that name. */
  async get(name: string): Promise<Scene | null> {
    if (!isSceneName(name)) return null;
    const path = join(this.dir, `${name}.json`);
    let mtimeMs: number;
    try {
      ({ mtimeMs } = await stat(path));
    } catch {
      return null;
    }
    const cached = this.cache.get(name);
    if (cached?.mtimeMs === mtimeMs) return cached.scene;

    const result = parseScene(await readFile(path, "utf8"));
    if (!result.ok) {
      throw new SceneFileError(
        `The scene "${name}" has problems: ${result.problems.join(" ")}`,
      );
    }
    this.cache.set(name, { mtimeMs, scene: result.scene });
    return result.scene;
  }
}
