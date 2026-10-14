import { parsePositions, type Layout } from "../shared/positions.js";
import type { Square } from "../shared/scene.js";

// The positions API of the server. The browser sends the visitor cookie
// (`dd_visitor`) with each call, as the calls go to the same origin.

/**
 * How a save ends: it saved, or it did not. A 409 (another sprite stands
 * there) gives the visitor's positions on the server.
 */
type SaveResult = { ok: true } | { ok: false; positions?: Layout };

/**
 * This visitor's positions in `scene`: the square of each sprite, with the
 * saved moves on top of the scene file. The server merges them, so the board
 * shows them as they are. It throws when they do not load.
 */
export async function loadPositions(scene: string): Promise<Layout> {
  const res = await fetch(
    `/api/scenes/${encodeURIComponent(scene)}/positions`,
    {
      headers: { Accept: "application/json" },
    },
  );
  if (!res.ok) throw new Error(`The positions answered ${res.status}.`);
  const body = (await res.json()) as { positions?: unknown };
  const positions = parsePositions(body.positions);
  if (!positions) throw new Error("The positions have a wrong shape.");
  return positions;
}

/** Saves the move of sprite `id` in `scene` to `to`. It never throws. */
export async function savePosition(
  scene: string,
  id: string,
  to: Square,
): Promise<SaveResult> {
  try {
    const res = await fetch(
      `/api/scenes/${encodeURIComponent(scene)}/sprites/${encodeURIComponent(id)}/position`,
      {
        method: "PUT",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ at: [to.x, to.z] }),
      },
    );
    if (res.ok) return { ok: true };
    if (res.status !== 409) return { ok: false };
    const body = (await res.json()) as { positions?: unknown };
    return {
      ok: false,
      positions: parsePositions(body.positions) ?? undefined,
    };
  } catch {
    return { ok: false };
  }
}
