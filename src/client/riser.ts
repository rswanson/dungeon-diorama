// The geometry of the steps of the path line. It has no DOM, so the tests can use it.
import { Vector3 } from "three";

/** The width of the line, in board units. */
export const WIDTH = 0.1;
/**
 * A step up or down is a vertical part of the line at the edge between the
 * two squares, this far over the lower square, so it does not touch the side
 * of the higher column.
 */
export const EDGE_GAP = 0.02;

/** A face of the line: four corners, in order around it. */
export type Face = [Vector3, Vector3, Vector3, Vector3];

/**
 * The step of the line from the top `p` to the top `q`, at different heights:
 * the point `near` where the line leaves the height of `p`, the point `far`
 * where it arrives at the height of `q`, and the four vertical faces of the
 * riser between them.
 *
 * The riser is a thin box, as wide as the line each way, at the edge (or the
 * corner) between the two squares. Its side nearest the higher column is
 * `EDGE_GAP` over the lower square, so it does not touch the column. The four
 * faces look in two directions at a right angle to each other, so from no
 * side are all of them edge-on, as one flat face is from a view along it.
 */
export function step(
  p: Vector3,
  q: Vector3,
): { near: Vector3; far: Vector3; risers: Face[] } {
  const way = q.clone().sub(p).setY(0).normalize();
  const towardLower = q.y > p.y ? way.clone().negate() : way.clone();
  const half = WIDTH / 2;
  const centre = p
    .clone()
    .lerp(q, 0.5)
    .addScaledVector(towardLower, EDGE_GAP + half);
  const near = centre.clone().setY(p.y);
  const far = centre.clone().setY(q.y);
  const side = across(p, q);
  const along = way.clone().multiplyScalar(half);
  // The corners of the box, around it.
  const corners = [
    centre.clone().add(side).add(along),
    centre.clone().add(side).sub(along),
    centre.clone().sub(side).sub(along),
    centre.clone().sub(side).add(along),
  ];
  const risers = corners.map((corner, i): Face => {
    const next = corners[(i + 1) % corners.length];
    return [
      corner.clone().setY(p.y),
      next.clone().setY(p.y),
      next.clone().setY(q.y),
      corner.clone().setY(q.y),
    ];
  });
  return { near, far, risers };
}

/** Half the width of the line, flat and at a right angle to the way from p to q. */
export function across(p: Vector3, q: Vector3): Vector3 {
  const way = q.clone().sub(p).setY(0).normalize();
  return new Vector3(-way.z, 0, way.x).multiplyScalar(WIDTH / 2);
}
