-- A row exists only for a sprite that the visitor moved. Other sprites stand
-- where the scene file puts them.
CREATE TABLE sprite_positions (
  visitor_id uuid        NOT NULL,
  scene      text        NOT NULL,
  sprite_id  text        NOT NULL,
  x          smallint    NOT NULL,
  z          smallint    NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (visitor_id, scene, sprite_id)
);
