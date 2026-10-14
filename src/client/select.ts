import { canvasPoint, type CameraControls, type Point } from "./controls.js";

/** A press that moves less than this many CSS pixels before its release is a click. */
export const CLICK_SLOP = 4;

export interface PressHandlers {
  /** A primary press (or one finger) and its release with less than `CLICK_SLOP` px of movement. */
  click(at: Point): void;
}

/**
 * Finds clicks on the canvas: a press of the primary button, a pen or one
 * finger, then a release near the same point. The camera controls use the
 * other buttons and two fingers. A second touch cancels the click.
 * Keep all press logic here: the sprite drag (B5) adds a press that moves.
 */
export function attachPress(
  canvas: HTMLCanvasElement,
  controls: Pick<CameraControls, "touchCount">,
  handlers: PressHandlers,
): void {
  /** The press that can still become a click. */
  let press: (Point & { id: number }) | null = null;

  const local = (e: PointerEvent): Point =>
    canvasPoint(canvas, e.clientX, e.clientY);

  canvas.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch") {
      // The camera controls listen first, so the count holds this touch. Two
      // fingers pan and pinch the view, so a second finger cancels the click.
      press =
        controls.touchCount === 1 ? { id: e.pointerId, ...local(e) } : null;
      return;
    }
    // A new press replaces one whose release was off the canvas.
    if (e.button === 0) press = { id: e.pointerId, ...local(e) };
  });

  canvas.addEventListener("pointermove", (e) => {
    if (press?.id !== e.pointerId) return;
    const at = local(e);
    if (Math.hypot(at.x - press.x, at.y - press.y) >= CLICK_SLOP) press = null;
  });

  canvas.addEventListener("pointerup", (e) => {
    if (press?.id !== e.pointerId) return;
    const at = local(e);
    const moved = Math.hypot(at.x - press.x, at.y - press.y);
    press = null;
    if (moved < CLICK_SLOP) handlers.click(at);
  });

  canvas.addEventListener("pointercancel", (e) => {
    if (press?.id === e.pointerId) press = null;
  });
}
