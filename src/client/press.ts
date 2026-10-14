// The press-to-click rule, with no DOM so that a test can run it in Node.

/** A point on the canvas, in CSS pixels. */
export interface PressPoint {
  x: number;
  y: number;
}

/** A press that moves less than this many CSS pixels before its release is a click. */
export const CLICK_SLOP = 4;

/**
 * The state of the press that can still become a click. It has no DOM, so a
 * test can drive it with plain pointer data.
 */
export class PressTracker {
  private press: (PressPoint & { id: number }) | null = null;

  /**
   * A pointer goes down. A touch press counts only as the one finger on the
   * canvas (`touchCount` is 1); a second finger cancels the click. Another
   * pointer keeps the press only for the primary button.
   */
  down(
    id: number,
    at: PressPoint,
    kind: { touch: boolean; button: number },
    touchCount: number,
  ): void {
    if (kind.touch) {
      this.press = touchCount === 1 ? { id, ...at } : null;
      return;
    }
    // A new press replaces one whose release was off the canvas.
    if (kind.button === 0) this.press = { id, ...at };
  }

  /** A pointer moves. A move of `CLICK_SLOP` or more ends the click for good. */
  move(id: number, at: PressPoint): void {
    if (this.press?.id !== id) return;
    if (this.distance(at) >= CLICK_SLOP) this.press = null;
  }

  /** A pointer goes up. It returns the point of the click, or null when it is not one. */
  up(id: number, at: PressPoint): PressPoint | null {
    if (this.press?.id !== id) return null;
    const moved = this.distance(at);
    this.press = null;
    return moved < CLICK_SLOP ? at : null;
  }

  cancel(id: number): void {
    if (this.press?.id === id) this.press = null;
  }

  private distance(at: PressPoint): number {
    return this.press
      ? Math.hypot(at.x - this.press.x, at.y - this.press.y)
      : 0;
  }
}
