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
];
