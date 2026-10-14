import { canvasPoint, type CameraControls } from "./controls.js";
import type { Point } from "./point.js";
import { PressTracker, type PressEvent } from "./press.js";

/** What a press can drag, and the steps of its drag. `SpriteDrag` is one. */
interface DragHandlers<T> {
  /** What a press at `at` can drag, or null. It runs once for each press that can click or drag. */
  grab(at: Point): T | null;
  /** A press on something that can move moved `CLICK_SLOP` px or more. */
  start(grab: T, at: Point): void;
  move(at: Point): void;
  drop(at: Point): void;
  /** Esc, a second finger, or the browser stopped the drag. */
  cancel(): void;
}

/**
 * Finds clicks and drags on the canvas: a press of the primary button, a pen
 * or one finger. The camera controls use the other buttons and two fingers. A
 * second touch cancels the click or the drag. `click` gets a press and its
 * release with less than `CLICK_SLOP` px of movement, with what the press
 * grabbed. Keep the press rules in `PressTracker`.
 */
export function attachPointer<T>(
  canvas: HTMLCanvasElement,
  controls: Pick<CameraControls, "touchCount">,
  drag: DragHandlers<T>,
  click: (grab: T | null, at: Point) => void,
): void {
  const tracker = new PressTracker<T>();
  const local = (e: PointerEvent): Point =>
    canvasPoint(canvas, e.clientX, e.clientY);

  const run = (event: PressEvent<T>, e?: PointerEvent): void => {
    switch (event?.kind) {
      case "click":
        click(event.grab, event.at);
        break;
      case "drag-start":
        // The drag keeps its pointer when it leaves the canvas. The capture
        // ends by itself on the release.
        if (e) canvas.setPointerCapture(e.pointerId);
        drag.start(event.grab, event.at);
        break;
      case "drag-move":
        drag.move(event.at);
        break;
      case "drop":
        drag.drop(event.at);
        break;
      case "drag-cancel":
        drag.cancel();
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
        () => drag.grab(at),
      ),
    );
  });

  canvas.addEventListener("pointermove", (e) => {
    const at = local(e);
    // A mouse or pen move without the primary button down is the release of a
    // press whose button went up while another button was still down: no
    // pointerup comes. A finger has no buttons.
    if (e.pointerType !== "touch" && (e.buttons & 1) === 0) {
      run(tracker.release(e.pointerId, at));
    } else {
      run(tracker.move(e.pointerId, at), e);
    }
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
