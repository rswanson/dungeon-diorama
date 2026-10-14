import { canvasPoint, type CameraControls, type Point } from "./controls.js";
import { PressTracker } from "./press.js";

export interface PressHandlers {
  /** A primary press (or one finger) and its release with less than `CLICK_SLOP` px of movement. */
  click(at: Point): void;
}

/**
 * Finds clicks on the canvas: a press of the primary button, a pen or one
 * finger, then a release near the same point. The camera controls use the
 * other buttons and two fingers. A second touch cancels the click.
 * Keep all press logic in `PressTracker`: the sprite drag (B5) adds a press
 * that moves.
 */
export function attachPress(
  canvas: HTMLCanvasElement,
  controls: Pick<CameraControls, "touchCount">,
  handlers: PressHandlers,
): void {
  const tracker = new PressTracker();
  const local = (e: PointerEvent): Point =>
    canvasPoint(canvas, e.clientX, e.clientY);

  canvas.addEventListener("pointerdown", (e) => {
    // The camera controls listen first, so the count holds this touch.
    tracker.down(
      e.pointerId,
      local(e),
      { touch: e.pointerType === "touch", button: e.button },
      controls.touchCount,
    );
  });

  canvas.addEventListener("pointermove", (e) => {
    tracker.move(e.pointerId, local(e));
  });

  canvas.addEventListener("pointerup", (e) => {
    const at = tracker.up(e.pointerId, local(e));
    if (at) handlers.click(at);
  });

  canvas.addEventListener("pointercancel", (e) => {
    tracker.cancel(e.pointerId);
  });
}
