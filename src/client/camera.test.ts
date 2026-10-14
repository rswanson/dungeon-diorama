import { Box3, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  BoardCamera,
  frustum,
  maxZoom,
  MIN_ZOOM,
  TURN_MS,
  TURN_STEP,
} from "./camera.js";

describe("frustum", () => {
  const board = { halfWidth: 10, halfHeight: 6 };

  it("fills a wide or a tall window, holds the board and keeps its center", () => {
    for (const aspect of [16 / 9, 390 / 844]) {
      const f = frustum(board, aspect, 1);
      expect(f.left).toBe(-f.right);
      expect(f.bottom).toBe(-f.top);
      expect((f.right - f.left) / (f.top - f.bottom)).toBeCloseTo(aspect);
      expect(f.right).toBeGreaterThanOrEqual(board.halfWidth);
      expect(f.top).toBeGreaterThanOrEqual(board.halfHeight);
      // One side fits the board exactly, so the board is as large as it can be.
      expect(
        Math.min(f.right - board.halfWidth, f.top - board.halfHeight),
      ).toBeCloseTo(0);
    }
  });
});

describe("BoardCamera", () => {
  const BOX = new Box3(new Vector3(0, 0, 0), new Vector3(16, 5, 12));
  const [W, H] = [800, 600];

  function view(): BoardCamera {
    const v = new BoardCamera(BOX);
    v.resize(W, H);
    return v;
  }

  /** The place of a world point on the screen, in CSS pixels from the top left. */
  function screenOf(v: BoardCamera, point: Vector3): { x: number; y: number } {
    const ndc = point.clone().project(v.camera);
    return { x: ((ndc.x + 1) / 2) * W, y: ((1 - ndc.y) / 2) * H };
  }

  it("turns the board a quarter turn clockwise on the screen in 250 ms", () => {
    const v = view();
    const start = v.azimuth;
    const right = new Vector3(2, 0, 0).add(v.target);
    const center = screenOf(v, v.target);
    const before = screenOf(v, right);

    expect(v.rotate(1, 0)).toBe(true);
    expect(v.tick(TURN_MS / 2)).toBe(true);
    expect(Math.abs(v.azimuth - start)).toBeGreaterThan(0);
    expect(Math.abs(v.azimuth - start)).toBeLessThan(TURN_STEP);
    expect(v.tick(TURN_MS)).toBe(false);
    expect(Math.abs(v.azimuth - start)).toBeCloseTo(TURN_STEP, 10);

    // With y down on the screen, a positive cross product is a clockwise turn.
    const after = screenOf(v, right);
    const [ax, ay] = [before.x - center.x, before.y - center.y];
    const [bx, by] = [after.x - center.x, after.y - center.y];
    expect(ax * by - ay * bx).toBeGreaterThan(0);
  });

  it("queues one more turn at most and always stops on a quarter turn", () => {
    const v = view();
    const start = v.azimuth;
    expect(v.rotate(1, 0)).toBe(true);
    expect(v.rotate(1, 50)).toBe(true);
    // A third turn while two wait does nothing.
    expect(v.rotate(1, 60)).toBe(false);
    v.tick(50 + TURN_MS);
    expect(Math.abs(v.azimuth - start)).toBeCloseTo(2 * TURN_STEP, 10);

    // A turn back during a turn ends on a quarter turn too.
    v.rotate(1, 1000);
    v.tick(1000 + TURN_MS / 3);
    v.rotate(-1, 1000 + TURN_MS / 3);
    v.tick(2000);
    expect(Math.abs(v.azimuth - start)).toBeCloseTo(2 * TURN_STEP, 10);
  });

  it("stops the zoom at the whole board and at 3 squares across", () => {
    const v = view();
    v.zoomAt(1e6, W / 2, H / 2);
    expect(v.camera.zoom).toBe(maxZoom(v.camera));
    // The window is wide, so its height is the short side.
    expect((v.camera.top - v.camera.bottom) / v.camera.zoom).toBeCloseTo(3);
    v.zoomAt(1e-6, W / 2, H / 2);
    expect(v.camera.zoom).toBe(MIN_ZOOM);
  });

  it("keeps the board point under the pointer still when it zooms", () => {
    const v = view();
    const point = v.ray(600, 200).at(100, new Vector3());
    v.zoomAt(2, 600, 200);
    expect(v.camera.zoom).toBe(2);
    const after = screenOf(v, point);
    expect(after.x).toBeCloseTo(600, 6);
    expect(after.y).toBeCloseTo(200, 6);
  });

  it("moves the board with the pointer and keeps the target on the board", () => {
    const v = view();
    v.rotate(1, 0);
    v.tick(TURN_MS);
    v.zoomAt(2, W / 2, H / 2);
    const point = new Vector3(5, 1, 4);
    const before = screenOf(v, point);
    v.pan(30, -20);
    const after = screenOf(v, point);
    expect(after.x - before.x).toBeCloseTo(30, 6);
    expect(after.y - before.y).toBeCloseTo(-20, 6);

    for (const [dx, dy] of [
      [1e5, 0],
      [0, 1e5],
      [-1e5, -1e5],
    ]) {
      v.pan(dx, dy);
      expect(v.target.x).toBeGreaterThanOrEqual(BOX.min.x);
      expect(v.target.x).toBeLessThanOrEqual(BOX.max.x);
      expect(v.target.z).toBeGreaterThanOrEqual(BOX.min.z);
      expect(v.target.z).toBeLessThanOrEqual(BOX.max.z);
    }
  });

  it("returns true when the view changed and false when a limit stops it", () => {
    const v = view();
    expect(v.zoomAt(2, W / 2, H / 2)).toBe(true);
    expect(v.pan(30, -20)).toBe(true);

    // Zooming out past the smallest zoom changes nothing.
    v.zoomAt(1e-6, W / 2, H / 2);
    expect(v.camera.zoom).toBe(MIN_ZOOM);
    const target = v.target.clone();
    expect(v.zoomAt(0.5, 100, 100)).toBe(false);
    expect(v.camera.zoom).toBe(MIN_ZOOM);
    expect(v.target).toEqual(target);

    // The same at the largest zoom.
    v.zoomAt(1e6, W / 2, H / 2);
    const zoom = v.camera.zoom;
    expect(zoom).toBe(maxZoom(v.camera));
    const atMax = v.target.clone();
    expect(v.zoomAt(2, 100, 100)).toBe(false);
    expect(v.camera.zoom).toBe(zoom);
    expect(v.target).toEqual(atMax);

    // A pan against the edge of the board moves nothing.
    v.pan(1e5, 0);
    const edge = v.target.clone();
    expect(v.pan(1e5, 0)).toBe(false);
    expect(v.target).toEqual(edge);
  });
});
