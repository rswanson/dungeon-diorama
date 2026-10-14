import { canvasPoint, type CameraControls, type Point } from "./controls.js";
import { PressTracker, type PressEvent } from "./press.js";

export interface PointerHandlers<T> {
  /** What a press at `at` can drag, or null. It runs once for each press that can click or drag. */
  grab(at: Point): T | null;
  /** A press and its release with less than `CLICK_SLOP` px of movement. */
  click(at: Point): void;
  /** A press on something that can move moved `CLICK_SLOP` px or more. */
  dragStart(grab: T, at: Point): void;
  dragMove(at: Point): void;
  drop(at: Point): void;
  /** Esc, a second finger, or the browser stopped the drag. */
  dragCancel(): void;
}

/**
 * Finds clicks and drags on the canvas: a press of the primary button, a pen
 * or one finger. The camera controls use the other buttons and two fingers. A
 * second touch cancels the click or the drag. Keep the press rules in
 * `PressTracker`.
 */
export function attachPointer<T>(
  canvas: HTMLCanvasElement,
  controls: Pick<CameraControls, "touchCount">,
  handlers: PointerHandlers<T>,
): void {
  const tracker = new PressTracker<T>();
  const local = (e: PointerEvent): Point =>
    canvasPoint(canvas, e.clientX, e.clientY);

  const run = (event: PressEvent<T>, e?: PointerEvent): void => {
    switch (event?.kind) {
      case "click":
        handlers.click(event.at);
        break;
      case "drag-start":
        // The drag keeps its pointer when it leaves the canvas. The capture
        // ends by itself on the release.
        if (e) canvas.setPointerCapture(e.pointerId);
        handlers.dragStart(event.grab, event.at);
        break;
      case "drag-move":
        handlers.dragMove(event.at);
        break;
      case "drop":
        handlers.drop(event.at);
        break;
      case "drag-cancel":
        handlers.dragCancel();
        break;
    }
  };

  canvas.addEventListener("pointerdown", (e) => {
    // The camera controls listen first, so the count holds this touch.
    const at = local(e);
    run(
      tracker.down(
        e.pointerId,
        at,
        { touch: e.pointerType === "touch", button: e.button },
        controls.touchCount,
        () => handlers.grab(at),
      ),
    );
  });

  canvas.addEventListener("pointermove", (e) => {
    // A move without the primary button down is the release of a press whose
    // button went up while another button was still down: no pointerup comes.
    run(tracker.move(e.pointerId, local(e), e.buttons), e);
  });

  canvas.addEventListener("pointerup", (e) => {
    run(tracker.up(e.pointerId, local(e)));
  });

  const cancel = (e: PointerEvent): void => run(tracker.cancel(e.pointerId));
  canvas.addEventListener("pointercancel", cancel);
  // After a release, the press has ended, so this does nothing.
  canvas.addEventListener("lostpointercapture", cancel);

  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const event = tracker.escape();
    if (event) e.preventDefault();
    run(event);
  });
}
