import { describe, expect, it } from "vitest";
import { CLICK_SLOP, PressTracker } from "./press.js";

const MOUSE = { touch: false, button: 0 };
const TOUCH = { touch: true, button: 0 };

describe("PressTracker", () => {
  it("makes a click of a press and a release within the slop", () => {
    const tracker = new PressTracker();
    tracker.down(1, { x: 10, y: 10 }, MOUSE, 0);
    tracker.move(1, { x: 11, y: 10 });
    expect(tracker.up(1, { x: 11, y: 10 })).toEqual({ x: 11, y: 10 });
  });

  it("makes no click when the pointer moves past the slop", () => {
    const tracker = new PressTracker();
    tracker.down(1, { x: 10, y: 10 }, MOUSE, 0);
    tracker.move(1, { x: 10 + CLICK_SLOP, y: 10 });
    expect(tracker.up(1, { x: 10 + CLICK_SLOP, y: 10 })).toBeNull();
  });

  it("makes no click when the pointer moves away and comes back", () => {
    const tracker = new PressTracker();
    tracker.down(1, { x: 10, y: 10 }, MOUSE, 0);
    tracker.move(1, { x: 40, y: 10 });
    tracker.move(1, { x: 10, y: 10 });
    expect(tracker.up(1, { x: 10, y: 10 })).toBeNull();
  });

  it("makes a click of a touch press with one finger", () => {
    const tracker = new PressTracker();
    tracker.down(7, { x: 5, y: 5 }, TOUCH, 1);
    expect(tracker.up(7, { x: 5, y: 5 })).toEqual({ x: 5, y: 5 });
  });

  it("cancels the click when a second finger goes down", () => {
    const tracker = new PressTracker();
    tracker.down(7, { x: 5, y: 5 }, TOUCH, 1);
    tracker.down(8, { x: 30, y: 30 }, TOUCH, 2);
    expect(tracker.up(8, { x: 30, y: 30 })).toBeNull();
    expect(tracker.up(7, { x: 5, y: 5 })).toBeNull();
  });

  it("makes no click of a press with a button that is not the primary one", () => {
    const tracker = new PressTracker();
    tracker.down(1, { x: 10, y: 10 }, { touch: false, button: 2 }, 0);
    expect(tracker.up(1, { x: 10, y: 10 })).toBeNull();
  });

  it("makes no click when the browser cancels the pointer", () => {
    const tracker = new PressTracker();
    tracker.down(1, { x: 10, y: 10 }, MOUSE, 0);
    tracker.cancel(1);
    expect(tracker.up(1, { x: 10, y: 10 })).toBeNull();
  });
});
