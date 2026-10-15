import type { BoardCamera } from "./camera.js";
import type { Point } from "./point.js";

/** The zoom change for one pixel of mouse wheel. */
const WHEEL_ZOOM = 0.002;
/** The zoom change for one pixel of trackpad pinch (a wheel event with ctrlKey, in Chrome and Firefox). */
const PINCH_ZOOM = 0.01;
/** The pixels in one line and in one page of a wheel event that counts in lines or pages. */
const LINE_PX = 16;
const PAGE_PX = 800;
/** The keys that turn the view. E turns the board clockwise on the screen. */
const TURN_KEYS = new Map<string, 1 | -1>([
  ["e", 1],
  ["q", -1],
]);

/** Safari's pinch event. It is not in the DOM types. */
interface GestureEvent extends UIEvent {
  scale: number;
  clientX: number;
  clientY: number;
}

/** What `attachCameraControls` gives back. */
export interface CameraControls {
  /** The touch pointers now on the canvas. */
  readonly touchCount: number;
  /** Starts a quarter turn of the view, and draws it. */
  turn(dir: 1 | -1): void;
}

/**
 * Lets the player pan, zoom and turn the view with the mouse, a trackpad, the
 * keyboard and touch. A press of the primary button, or one finger, does
 * nothing here: the sprite drag uses it.
 */
export function attachCameraControls(
  canvas: HTMLCanvasElement,
  view: BoardCamera,
  requestDraw: () => void,
): CameraControls {
  /** The right or the middle button drag that pans, with the `buttons` bit of its button. */
  let drag: (Point & { id: number; bit: number }) | null = null;
  /** Each touch pointer on the canvas. Two of them pan and pinch. */
  const touches = new Map<number, Point>();
  let gestureScale = 1;

  /** Ends the pan drag of this pointer and lets go of the pointer. */
  const endDrag = (id: number): void => {
    drag = null;
    if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  };

  const local = (e: { clientX: number; clientY: number }): Point =>
    canvasPoint(canvas, e.clientX, e.clientY);

  canvas.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch") {
      touches.set(e.pointerId, local(e));
      return;
    }
    if ((e.button === 1 || e.button === 2) && !drag) {
      // A middle press must not start the browser's own scroll.
      e.preventDefault();
      drag = {
        id: e.pointerId,
        // The bit of this button in `PointerEvent.buttons`: 2 for right, 4 for middle.
        bit: e.button === 2 ? 2 : 4,
        ...local(e),
      };
      canvas.setPointerCapture(e.pointerId);
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (drag?.id === e.pointerId) {
      // The pan ends with its own button, even when another button is still down.
      if (!(e.buttons & drag.bit)) {
        endDrag(e.pointerId);
        return;
      }
      const at = local(e);
      if (view.pan(at.x - drag.x, at.y - drag.y)) requestDraw();
      Object.assign(drag, at);
      return;
    }
    const touch = touches.get(e.pointerId);
    if (!touch) return;
    const at = local(e);
    if (touches.size !== 2) {
      Object.assign(touch, at);
      return;
    }
    const before = pair(touches);
    Object.assign(touch, at);
    const after = pair(touches);
    const panned = view.pan(after.x - before.x, after.y - before.y);
    const zoomed =
      before.span > 0 &&
      view.zoomAt(after.span / before.span, after.x, after.y);
    if (panned || zoomed) requestDraw();
  });

  const release = (e: PointerEvent): void => {
    if (drag?.id === e.pointerId) endDrag(e.pointerId);
    touches.delete(e.pointerId);
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("lostpointercapture", release);

  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  canvas.addEventListener(
    "wheel",
    (e) => {
      // The page must not scroll or zoom.
      e.preventDefault();
      // `deltaMode` is 0 for pixels, 1 for lines and 2 for pages.
      const unit = [1, LINE_PX, PAGE_PX][e.deltaMode] ?? 1;
      const rate = e.ctrlKey ? PINCH_ZOOM : WHEEL_ZOOM;
      const at = local(e);
      if (view.zoomAt(Math.exp(-e.deltaY * unit * rate), at.x, at.y)) {
        requestDraw();
      }
    },
    { passive: false },
  );

  // Safari on a Mac sends a trackpad pinch as gesture events. Safari on an
  // iPad sends them too, with the touch pointers, which already pinch. The
  // state resets on gesturestart, so there is no gestureend listener.
  canvas.addEventListener("gesturestart", (e) => {
    e.preventDefault();
    gestureScale = 1;
  });
  canvas.addEventListener("gesturechange", (e) => {
    e.preventDefault();
    const gesture = e as GestureEvent;
    if (touches.size === 0 && gestureScale > 0) {
      const at = local(gesture);
      if (view.zoomAt(gesture.scale / gestureScale, at.x, at.y)) requestDraw();
    }
    gestureScale = gesture.scale;
  });

  const turn = (dir: 1 | -1): void => {
    if (view.rotate(dir)) requestDraw();
  };

  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || inTextField(e)) return;
    const dir = TURN_KEYS.get(e.key.toLowerCase());
    if (!dir) return;
    e.preventDefault();
    // A held key repeats. One press makes one turn.
    if (e.repeat) return;
    turn(dir);
  });

  return {
    get touchCount() {
      return touches.size;
    },
    turn,
  };
}

/**
 * True for a key in a text field, for example the dice input. There, Q, E
 * and Esc are text keys, so the board does not act on them.
 */
export function inTextField(e: KeyboardEvent): boolean {
  return (
    e.target instanceof HTMLInputElement ||
    e.target instanceof HTMLTextAreaElement
  );
}

/**
 * A point of the page (`clientX`, `clientY`) in CSS pixels from the top left
 * of the canvas, as `BoardCamera.ray` and `BoardCamera.zoomAt` take it.
 */
export function canvasPoint(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): Point {
  const rect = canvas.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}

/** The midpoint of two touches and the distance between them. */
function pair(touches: Map<number, Point>): Point & { span: number } {
  const [a, b] = touches.values();
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    span: Math.hypot(a.x - b.x, a.y - b.y),
  };
}
