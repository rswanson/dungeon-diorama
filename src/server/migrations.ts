/**
 * The migrations of the database, in order. The server applies each one that
 * `schema_migrations` does not list when it starts (`migrate` in `db.ts`).
 * Add a new migration at the end. Do not change a migration that is on `main`.
 */
export const MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: "001_sprite_positions",
    // A row exists only for a sprite that the visitor moved. Other sprites
    // stand where the scene file puts them.
    sql: `CREATE TABLE sprite_positions (
      visitor_id uuid        NOT NULL,
      scene      text        NOT NULL,
      sprite_id  text        NOT NULL,
      x          smallint    NOT NULL,
      z          smallint    NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (visitor_id, scene, sprite_id)
    )`,
  },
  {
    name: "002_dice_rolls",
    // Each entry of the dice log of a visitor in a scene. Nothing deletes rows.
    sql: `CREATE TABLE dice_rolls (
      id         bigserial   PRIMARY KEY,
      visitor_id uuid        NOT NULL,
      scene      text        NOT NULL,
      kind       text        NOT NULL CHECK (kind IN ('roll', 'note')),
      parts      jsonb       NOT NULL,
      rolled_at  timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX dice_rolls_visitor_scene ON dice_rolls (visitor_id, scene, id DESC)`,
  },
];
