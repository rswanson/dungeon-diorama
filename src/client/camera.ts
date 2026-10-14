import {
  Box3,
  MathUtils,
  OrthographicCamera,
  Ray,
  Raycaster,
  Vector2,
  Vector3,
} from "three";

/** The isometric angle above the ground: atan(1 / √2), about 35.26°. */
const ELEVATION = Math.atan(1 / Math.SQRT2);
/** At the start, the camera stands on the +x, +z side of the board and looks to the far corner. */
const START_AZIMUTH = Math.PI / 4;
/** One turn of the view. */
export const TURN_STEP = Math.PI / 2;
/** The time of one turn, in milliseconds. */
export const TURN_MS = 250;
/** The space around the board, as a part of the board's size in the view. */
const MARGIN = 1.12;
/** The distance from the camera to its target. An orthographic view does not change with it. */
const DISTANCE = 100;
/** The least zoom shows the whole board with its margin. */
export const MIN_ZOOM = 1;
/** At the most zoom, the short side of the view is this many board units. */
const CLOSEST_VIEW = 3;

/** The half width and the half height of a view, in board units. */
interface ViewSize {
  halfWidth: number;
  halfHeight: number;
}

interface Frustum {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * The frustum for a window with this aspect (width / height). It fills the
 * window, holds all of `content` with a margin, and keeps its center on the
 * camera's target.
 */
export function frustum(
  content: ViewSize,
  aspect: number,
  margin = MARGIN,
): Frustum {
  const halfHeight =
    Math.max(content.halfHeight, content.halfWidth / aspect) * margin;
  const halfWidth = halfHeight * aspect;
  return {
    left: -halfWidth,
    right: halfWidth,
    top: halfHeight,
    bottom: -halfHeight,
  };
}

/** The most zoom for a frustum: its short side then holds `CLOSEST_VIEW` units. */
export function maxZoom(f: Frustum): number {
  const short = Math.min(f.right - f.left, f.top - f.bottom);
  return Math.max(MIN_ZOOM, short / CLOSEST_VIEW);
}

/** The camera angle around the board after this many quarter turns. */
function azimuthOf(turns: number): number {
  return START_AZIMUTH + turns * TURN_STEP;
}

/**
 * The eased part (0–1) of a movement after the part `t` of its time, clamped
 * to 0–1: fast at the start, slow at the end. A turn and a sprite's settle use it.
 */
export function easeOut(t: number): number {
  return 1 - (1 - MathUtils.clamp(t, 0, 1)) ** 3;
}

/**
 * The orthographic camera that looks at the board. At the start it looks at
 * the center of the board and frames all of it. The player pans, zooms and
 * turns it in quarter turns.
 */
export class BoardCamera {
  readonly camera = new OrthographicCamera();
  readonly target: Vector3;
  private readonly box: Box3;
  private readonly content: ViewSize;
  private width = 1;
  private height = 1;
  /** The quarter turns of the camera from the start. The current turn ends there. */
  private turns = 0;
  private angle = azimuthOf(0);
  /** The quarter turns when the running turn started, or now when no turn runs. */
  private settled = 0;
  private turn: { from: number; start: number } | null = null;
  private readonly raycaster = new Raycaster();
  private readonly ndc = new Vector2();
  private readonly projected = new Vector3();

  constructor(box: Box3) {
    this.box = box.clone();
    this.target = box.getCenter(new Vector3());
    this.camera.near = 1;
    this.camera.far = DISTANCE * 2;
    // One scale holds the whole board after each quarter turn.
    const sizes = [0, 1, 2, 3].map((turns) => {
      this.place(azimuthOf(turns));
      return this.measure();
    });
    this.content = {
      halfWidth: Math.max(...sizes.map((s) => s.halfWidth)),
      halfHeight: Math.max(...sizes.map((s) => s.halfHeight)),
    };
    this.place(this.angle);
  }

  /** The camera angle around the board, in radians. It changes during a turn. */
  get azimuth(): number {
    return this.angle;
  }

  /** Sets the view for a window of this size, in CSS pixels. It keeps the target and the zoom. */
  resize(width: number, height: number): void {
    this.width = Math.max(width, 1);
    this.height = Math.max(height, 1);
    Object.assign(this.camera, frustum(this.content, this.width / this.height));
    this.camera.zoom = MathUtils.clamp(
      this.camera.zoom,
      MIN_ZOOM,
      maxZoom(this.camera),
    );
    this.camera.updateProjectionMatrix();
  }

  /**
   * Starts a quarter turn: 1 turns the board clockwise on the screen, -1
   * counter-clockwise. A turn during a turn goes on from the end angle of that
   * turn. It returns false, and does nothing, when one more turn already waits.
   */
  rotate(dir: 1 | -1, now = performance.now()): boolean {
    const turns = this.turns + dir;
    if (Math.abs(turns - this.settled) > 2) return false;
    this.turns = turns;
    this.turn = { from: this.angle, start: now };
    return true;
  }

  /** Moves a turn on to the time `now`. It returns true while the turn goes on. */
  tick(now: number): boolean {
    if (!this.turn) return false;
    const t = (now - this.turn.start) / TURN_MS;
    const end = azimuthOf(this.turns);
    if (t >= 1) {
      this.angle = end;
      this.turn = null;
      this.settled = this.turns;
    } else {
      this.angle = MathUtils.lerp(this.turn.from, end, easeOut(t));
    }
    this.place(this.angle);
    return this.turn !== null;
  }

  /**
   * Moves the view so that the board moves `dx`, `dy` CSS pixels on the
   * screen. The target stays above the board. It returns true when the target
   * moved.
   */
  pan(dx: number, dy: number): boolean {
    const { x, z } = this.target;
    this.shift(dx, dy);
    this.box.clampPoint(this.target, this.target);
    if (this.target.x === x && this.target.z === z) return false;
    this.place(this.angle);
    return true;
  }

  /**
   * Multiplies the zoom by `factor`, within its limits. The board point at
   * `x`, `y` (CSS pixels from the top left of the view) stays at that place.
   * It returns true when the zoom or the target changed.
   */
  zoomAt(factor: number, x: number, y: number): boolean {
    const zoom = MathUtils.clamp(
      this.camera.zoom * factor,
      MIN_ZOOM,
      maxZoom(this.camera),
    );
    if (zoom === this.camera.zoom) return false;
    const keep = 1 - this.camera.zoom / zoom;
    const { x: tx, z: tz } = this.target;
    // The shift uses the board units of one pixel at the old zoom.
    this.shift(-(x - this.width / 2) * keep, (this.height / 2 - y) * keep);
    this.box.clampPoint(this.target, this.target);
    this.camera.zoom = zoom;
    this.camera.updateProjectionMatrix();
    if (this.target.x !== tx || this.target.z !== tz) this.place(this.angle);
    return true;
  }

  /** The ray from the camera through `x`, `y` (CSS pixels from the top left of the view). The ray is shared: it is valid until the next call. */
  ray(x: number, y: number): Ray {
    this.ndc.set((x / this.width) * 2 - 1, 1 - (y / this.height) * 2);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    return this.raycaster.ray;
  }

  /**
   * The place of the board point `world` in the view, in CSS pixels from the
   * top left. It is the reverse of `ray`. `out` receives the result when given.
   */
  screenPoint(world: Vector3, out = new Vector2()): Vector2 {
    this.projected.copy(world).project(this.camera);
    return out.set(
      ((this.projected.x + 1) / 2) * this.width,
      ((1 - this.projected.y) / 2) * this.height,
    );
  }

  /**
   * The length in CSS pixels of `units` board units across the view (square
   * to the camera), at the current zoom and size of the view.
   */
  unitsToPixels(units: number): number {
    const { left, right, zoom } = this.camera;
    return (units * this.width * zoom) / (right - left);
  }

  /** Moves the target on the ground so that the board moves `dx`, `dy` CSS pixels on the screen. It does not clamp or place the camera. */
  private shift(dx: number, dy: number): void {
    const units =
      (this.camera.right - this.camera.left) / this.camera.zoom / this.width;
    const sin = Math.sin(this.angle);
    const cos = Math.cos(this.angle);
    // The camera stands at (sin, cos) of the angle from the target, so on the
    // ground "right" on the screen is (cos, -sin) and "ahead" is (-sin, -cos).
    // A step on the ground away from the camera is shorter on the screen by sin(ELEVATION).
    const ahead = (dy * units) / Math.sin(ELEVATION);
    this.target.x += -dx * units * cos - ahead * sin;
    this.target.z += dx * units * sin - ahead * cos;
  }

  private place(azimuth: number): void {
    const offset = new Vector3().setFromSphericalCoords(
      DISTANCE,
      Math.PI / 2 - ELEVATION,
      azimuth,
    );
    this.camera.position.copy(this.target).add(offset);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }

  /** The half size of the board's box in the camera's view. */
  private measure(): ViewSize {
    // The target is the center of the box, so the box in view space is centered.
    const size = this.box
      .clone()
      .applyMatrix4(this.camera.matrixWorldInverse)
      .getSize(new Vector3());
    return { halfWidth: size.x / 2, halfHeight: size.y / 2 };
  }
}
