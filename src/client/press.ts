// The press rules (click, drag, drop and cancel), with no DOM so that a test can
// run them in Node.

/** A point on the canvas, in CSS pixels. The one point type of the pointer code. */
export interface Point {
  x: number;
  y: number;
}

/**
 * A press that moves less than this many CSS pixels before its release is a
 * click. A press on something that can move becomes a drag when it moves this
 * far or more.
 */
export const CLICK_SLOP = 4;

/** What a pointer event did to the press. `T` is what a press can drag, for example a sprite id. */
export type PressEvent<T> =
  | { kind: "click"; at: Point }
  | { kind: "drag-start"; grab: T; at: Point }
  | { kind: "drag-move"; at: Point }
  | { kind: "drop"; at: Point }
  | { kind: "drag-cancel" }
  | null;

interface Press<T> extends Point {
  id: number;
  /** True for a finger. A finger has no button, so the buttons of a move say nothing about it. */
  touch: boolean;
  /** What the press can drag, or null when it can only click. */
  grab: T | null;
  dragging: boolean;
}

const CANCEL = { kind: "drag-cancel" } as const;

/**
 * The state of the one press that can become a click or a drag. It has no DOM,
 * so a test can drive it with plain pointer data.
 */
export class PressTracker<T> {
  private press: Press<T> | null = null;

  /**
   * A pointer goes down. A touch press counts only as the one finger on the
   * canvas (`touchCount` is 1); a second finger cancels the click or the drag.
   * Another pointer starts a press only with the primary button. `grab` gives
   * what the press can drag; it runs only for a press that starts.
   */
  down(
    id: number,
    at: Point,
    kind: { touch: boolean; button: number },
    touchCount: number,
    grab: () => T | null,
  ): PressEvent<T> {
    if (!kind.touch && kind.button !== 0) return null;
    const cancelled = this.press?.dragging ? CANCEL : null;
    const starts = kind.touch ? touchCount === 1 : true;
    // A new press replaces one whose release was off the canvas.
    this.press = starts
      ? { id, ...at, touch: kind.touch, grab: grab(), dragging: false }
      : null;
    return cancelled;
  }

  /**
   * A pointer moves. A move of `CLICK_SLOP` or more ends the click for good,
   * and starts the drag when the press can drag something. `buttons` is
   * `PointerEvent.buttons`. A mouse or pen move without the primary button
   * down is the release: the browser sends no pointerup when the primary
   * button goes up while another button is still down.
   */
  move(id: number, at: Point, buttons = 1): PressEvent<T> {
    const press = this.press;
    if (press?.id !== id) return null;
    if (!press.touch && (buttons & 1) === 0) return this.up(id, at, false);
    if (press.dragging) return { kind: "drag-move", at };
    if (this.distance(at) < CLICK_SLOP) return null;
    if (press.grab === null) {
      this.press = null;
      return null;
    }
    press.dragging = true;
    return { kind: "drag-start", grab: press.grab, at };
  }

  /**
   * A pointer goes up. It gives a click, a drop, or null. A release that is
   * found from a move (`click` false) is not a click.
   */
  up(id: number, at: Point, click = true): PressEvent<T> {
    const press = this.press;
    if (press?.id !== id) return null;
    this.press = null;
    if (press.dragging) return { kind: "drop", at };
    if (!click) return null;
    return this.distance(at, press) < CLICK_SLOP ? { kind: "click", at } : null;
  }

  /** The browser cancels the pointer, or the canvas loses it. */
  cancel(id: number): PressEvent<T> {
    const press = this.press;
    if (press?.id !== id) return null;
    this.press = null;
    return press.dragging ? CANCEL : null;
  }

  /** The player presses Esc. It cancels a drag, and leaves a press that is not a drag. */
  escape(): PressEvent<T> {
    if (!this.press?.dragging) return null;
    this.press = null;
    return CANCEL;
  }

  private distance(at: Point, press = this.press): number {
    return press ? Math.hypot(at.x - press.x, at.y - press.y) : 0;
  }
}
