import { randomInt } from "node:crypto";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import type pg from "pg";
import { parseInput, rollTerm, type Entry } from "../shared/dice.js";
import type { At, Layout } from "../shared/positions.js";
import { isAt, onBoard } from "../shared/scene.js";
import { message, withTransaction } from "./db.js";
import { mergePositions } from "./positions.js";
import { SceneFileError, type SceneFiles } from "./scenes.js";
import { visitor, type VisitorEnv } from "./visitor.js";

interface ApiOptions {
  db: pg.Pool;
  scenes: SceneFiles;
  /** Sets `Secure` on the visitor cookie. True in production. */
  secureCookie: boolean;
}

/** Each lock of a move holds this first key, and a hash of the visitor and the scene. */
const MOVE_LOCK = 7_331_002;

/** The body of a move is `{"at": [x, z]}`, so a body of more than this many bytes is an error (413). */
const MAX_MOVE_BYTES = 1024;

/** The body of a roll is `{"text": "..."}` with at most 500 characters, so a body of more than this many bytes is an error (413). */
const MAX_ROLL_BYTES = 4096;

/**
 * Reads the body of a move: `{"at": [x, z]}` with two whole numbers. It gives
 * null for any other body.
 */
export function parseMove(body: unknown): At | null {
  if (typeof body !== "object" || body === null) return null;
  const at = (body as { at?: unknown }).at;
  return isAt(at) ? [at[0], at[1]] : null;
}

/**
 * Reads the body of a roll: `{"text": "..."}`. It gives the text, or null for
 * any other body.
 */
function parseRollBody(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const text = (body as { text?: unknown }).text;
  return typeof text === "string" ? text : null;
}

/** The middleware that answers 413 for a body of more than `maxSize` bytes. */
function jsonLimit(maxSize: number) {
  return bodyLimit({
    maxSize,
    onError: (c) => c.json({ error: "The body is too large." }, 413),
  });
}

/** The JSON API, at `/api`. */
export function createApi({ db, scenes, secureCookie }: ApiOptions) {
  const api = new Hono<VisitorEnv>();
  api.use("*", visitor({ secure: secureCookie }));

  api.onError((error, c) => {
    console.error(`${c.req.method} ${c.req.path} failed: ${message(error)}`);
    const text =
      error instanceof SceneFileError
        ? "The scene file has problems."
        : "The server failed.";
    return c.json({ error: text }, 500);
  });

  api.get("/scenes/:scene/positions", async (c) => {
    const scene = await scenes.get(c.req.param("scene"));
    if (!scene) return notFound(c, "The scene does not exist.");
    const saved = await savedRows(db, c.get("visitor"), c.req.param("scene"));
    return c.json({ positions: mergePositions(scene, saved) });
  });

  api.put(
    "/scenes/:scene/sprites/:spriteId/position",
    jsonLimit(MAX_MOVE_BYTES),
    async (c) => {
      const name = c.req.param("scene");
      const spriteId = c.req.param("spriteId");
      const scene = await scenes.get(name);
      if (!scene) return notFound(c, "The scene does not exist.");
      if (!scene.sprites.some((s) => s.id === spriteId)) {
        return notFound(c, "The scene has no sprite with this id.");
      }
      const at = parseMove(await c.req.json().catch(() => null));
      if (!at) {
        return c.json({ error: 'The body must be {"at": [x, z]}.' }, 400);
      }
      if (!onBoard(scene.board, { x: at[0], z: at[1] })) {
        return c.json({ error: "The square is off the board." }, 400);
      }

      const visitorId = c.get("visitor");
      // The layout when another sprite stands on the square, else null.
      const conflict = await withTransaction(
        db,
        async (client): Promise<Layout | null> => {
          // One move at a time for each visitor and scene, so the check below
          // sees each move that went before it.
          await client.query("SELECT pg_advisory_xact_lock($1, hashtext($2))", [
            MOVE_LOCK,
            `${visitorId}/${name}`,
          ]);
          const saved = await savedRows(client, visitorId, name);
          const layout = mergePositions(scene, saved);
          const taken = Object.entries(layout).some(
            ([id, [x, z]]) => id !== spriteId && x === at[0] && z === at[1],
          );
          if (taken) return layout;
          // A saved row that the merge ignores goes, so that its sprite does
          // not jump to it when the square comes free later.
          const ignored = Object.entries(saved)
            .filter(([id, [x, z]]) => {
              const now = layout[id];
              return now !== undefined && (now[0] !== x || now[1] !== z);
            })
            .map(([id]) => id);
          if (ignored.length > 0) {
            await client.query(
              `DELETE FROM sprite_positions
              WHERE visitor_id = $1 AND scene = $2 AND sprite_id = ANY($3)`,
              [visitorId, name, ignored],
            );
          }
          await client.query(
            `INSERT INTO sprite_positions (visitor_id, scene, sprite_id, x, z)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (visitor_id, scene, sprite_id)
           DO UPDATE SET x = EXCLUDED.x, z = EXCLUDED.z, updated_at = now()`,
            [visitorId, name, spriteId, at[0], at[1]],
          );
          return null;
        },
      );
      if (conflict) {
        // The client shows this layout, so it needs no other read.
        return c.json(
          {
            error: "Another sprite stands on that square.",
            positions: conflict,
          },
          409,
        );
      }
      return c.json({ at });
    },
  );

  api.post("/scenes/:scene/rolls", jsonLimit(MAX_ROLL_BYTES), async (c) => {
    const name = c.req.param("scene");
    if (!(await scenes.get(name))) {
      return notFound(c, "The scene does not exist.");
    }
    const text = parseRollBody(await c.req.json().catch(() => null));
    if (text === null) {
      return c.json({ error: 'The body must be {"text": "..."}.' }, 400);
    }
    const parsed = parseInput(text);
    if (parsed.kind === "empty") {
      return c.json({ error: "The text is empty." }, 400);
    }
    if (parsed.kind === "error") return c.json({ error: parsed.error }, 400);

    // The roll exists only once its row saves: a failed insert gives 500.
    const parts = [
      { roll: rollTerm(parsed.term, (sides) => randomInt(1, sides + 1)) },
    ];
    const { rows } = await db.query<{ id: string; rolled_at: Date }>(
      `INSERT INTO dice_rolls (visitor_id, scene, kind, parts)
         VALUES ($1, $2, 'roll', $3)
         RETURNING id, rolled_at`,
      [c.get("visitor"), name, JSON.stringify(parts)],
    );
    const entry: Entry = {
      // A bigserial comes back as text.
      id: Number(rows[0].id),
      kind: "roll",
      at: rows[0].rolled_at.toISOString(),
      parts,
    };
    return c.json({ roll: entry }, 201);
  });

  return api;
}

function notFound(c: Context, error: string) {
  return c.json({ error }, 404);
}

/** The saved squares of a visitor in a scene, by sprite id. */
async function savedRows(
  db: pg.Pool | pg.PoolClient,
  visitorId: string,
  scene: string,
): Promise<Record<string, At>> {
  const { rows } = await db.query<{ sprite_id: string; x: number; z: number }>(
    `SELECT sprite_id, x, z FROM sprite_positions
      WHERE visitor_id = $1 AND scene = $2
      ORDER BY sprite_id`,
    [visitorId, scene],
  );
  return Object.fromEntries(rows.map((row) => [row.sprite_id, [row.x, row.z]]));
}
