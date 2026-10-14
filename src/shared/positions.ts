// The shape of the positions that the API gives. The server makes them
// (`src/server/positions.ts`), and the client reads them.

import { isAt } from "./scene.js";

/** A square as `[x, z]`, as the scene file and the API give it. */
export type At = [number, number];

/** The square of each sprite, by sprite id. */
export type Layout = Record<string, At>;

/**
 * Reads the `positions` of the API's answer: an object of `[x, z]` by sprite
 * id. It gives null when the shape is wrong.
 */
export function parsePositions(data: unknown): Layout | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return null;
  }
  const entries = Object.entries(data);
  return entries.every(([, at]) => isAt(at))
    ? Object.fromEntries(entries)
    : null;
}
