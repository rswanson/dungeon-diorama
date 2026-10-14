import { Box3, OrthographicCamera, Vector3 } from "three";

/** The isometric angle above the ground: atan(1 / √2), about 35.26°. */
const ELEVATION = Math.atan(1 / Math.SQRT2);
/** The camera stands on the +x, +z side of the board and looks to the far corner. */
const AZIMUTH = Math.PI / 4;
/** The space around the board, as a part of the board's size in the view. */
const MARGIN = 1.12;
/** The distance from the camera to its target. An orthographic view does not change with it. */
const DISTANCE = 100;

/** The half width and the half height of a view, in board units. */
export interface ViewSize {
  halfWidth: number;
  halfHeight: number;
}

export interface Frustum {
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

/**
 * The orthographic camera that looks at the board. It looks at the center of
 * the board and frames all of it.
 */
export class BoardCamera {
  readonly camera = new OrthographicCamera();
  readonly target: Vector3;
  private readonly box: Box3;
  private content: ViewSize = { halfWidth: 1, halfHeight: 1 };
  private aspect = 1;

  constructor(box: Box3) {
    this.box = box.clone();
    this.target = box.getCenter(new Vector3());
    this.camera.near = 1;
    this.camera.far = DISTANCE * 2;
    this.place(AZIMUTH, ELEVATION);
  }

  /** Sets the view for a window of this size, in CSS pixels. */
  resize(width: number, height: number): void {
    this.aspect = width / Math.max(height, 1);
    this.update();
  }

  private place(azimuth: number, elevation: number): void {
    const offset = new Vector3().setFromSphericalCoords(
      DISTANCE,
      Math.PI / 2 - elevation,
      azimuth,
    );
    this.camera.position.copy(this.target).add(offset);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
    this.content = this.measure();
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

  private update(): void {
    Object.assign(this.camera, frustum(this.content, this.aspect));
    this.camera.updateProjectionMatrix();
  }
}
