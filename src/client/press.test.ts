import { describe, expect, it } from "vitest";
import { CLICK_SLOP, PressTracker } from "./press.js";

const MOUSE = { touch: false, button: 0 };
const TOUCH = { touch: true, button: 0 };
const NOTHING = (): string | null => null;
const FIGHTER = (): string | null => "fighter";

describe("PressTracker clicks", () => {
  it("makes a click of a press and a release within the slop", () => {
    const tracker = new PressTracker<string>();
    tracker.down(1, { x: 10, y: 10 }, MOUSE, 0, NOTHING);
    tracker.move(1, { x: 11, y: 10 });
    expect(tracker.up(1, { x: 11, y: 10 })).toEqual({
      kind: "click",
      at: { x: 11, y: 10 },
    });
  });

  it("makes a click of a press on a sprite that does not move", () => {
    const tracker = new PressTracker<string>();
    tracker.down(1, { x: 10, y: 10 }, MOUSE, 0, FIGHTER);
    expect(tracker.move(1, { x: 12, y: 10 })).toBeNull();
    expect(tracker.up(1, { x: 12, y: 10 })?.kind).toBe("click");
  });

  it("makes no click when the pointer moves past the slop", () => {
    const tracker = new PressTracker<string>();
    tracker.down(1, { x: 10, y: 10 }, MOUSE, 0, NOTHING);
    expect(tracker.move(1, { x: 10 + CLICK_SLOP, y: 10 })).toBeNull();
    expect(tracker.up(1, { x: 10 + CLICK_SLOP, y: 10 })).toBeNull();
  });

  it("makes no click when the pointer moves away and comes back", () => {
    const tracker = new PressTracker<string>();
    tracker.down(1, { x: 10, y: 10 }, MOUSE, 0, NOTHING);
    tracker.move(1, { x: 40, y: 10 });
    tracker.move(1, { x: 10, y: 10 });
    expect(tracker.up(1, { x: 10, y: 10 })).toBeNull();
  });

  it("makes a click of a touch press with one finger", () => {
    const tracker = new PressTracker<string>();
    tracker.down(7, { x: 5, y: 5 }, TOUCH, 1, NOTHING);
    expect(tracker.up(7, { x: 5, y: 5 })?.kind).toBe("click");
  });

  it("cancels the click when a second finger goes down", () => {
    const tracker = new PressTracker<string>();
    tracker.down(7, { x: 5, y: 5 }, TOUCH, 1, NOTHING);
    tracker.down(8, { x: 30, y: 30 }, TOUCH, 2, NOTHING);
    expect(tracker.up(8, { x: 30, y: 30 })).toBeNull();
    expect(tracker.up(7, { x: 5, y: 5 })).toBeNull();
  });

  it("makes no click of a press with a button that is not the primary one", () => {
    const tracker = new PressTracker<string>();
    tracker.down(1, { x: 10, y: 10 }, { touch: false, button: 2 }, 0, FIGHTER);
    expect(tracker.up(1, { x: 10, y: 10 })).toBeNull();
  });

  it("makes no click when the browser cancels the pointer", () => {
    const tracker = new PressTracker<string>();
    tracker.down(1, { x: 10, y: 10 }, MOUSE, 0, NOTHING);
    expect(tracker.cancel(1)).toBeNull();
    expect(tracker.up(1, { x: 10, y: 10 })).toBeNull();
  });
});

describe("PressTracker drags", () => {
  /** A tracker with a mouse drag of the fighter under way. */
  function dragging(): PressTracker<string> {
    const tracker = new PressTracker<string>();
    tracker.down(1, { x: 10, y: 10 }, MOUSE, 0, FIGHTER);
    tracker.move(1, { x: 10, y: 10 + CLICK_SLOP });
    return tracker;
  }

  it("starts a drag when a press on a sprite moves the slop", () => {
    const tracker = new PressTracker<string>();
    tracker.down(1, { x: 10, y: 10 }, MOUSE, 0, FIGHTER);
    expect(tracker.move(1, { x: 10 + CLICK_SLOP - 1, y: 10 })).toBeNull();
    expect(tracker.move(1, { x: 10 + CLICK_SLOP, y: 10 })).toEqual({
      kind: "drag-start",
      grab: "fighter",
      at: { x: 10 + CLICK_SLOP, y: 10 },
    });
    expect(tracker.move(1, { x: 50, y: 10 })).toEqual({
      kind: "drag-move",
      at: { x: 50, y: 10 },
    });
  });

  it("starts a drag with one finger", () => {
    const tracker = new PressTracker<string>();
    tracker.down(7, { x: 5, y: 5 }, TOUCH, 1, FIGHTER);
    expect(tracker.move(7, { x: 5, y: 25 })?.kind).toBe("drag-start");
  });

  it("drops on the release, also when the pointer comes back to the start", () => {
    const tracker = dragging();
    tracker.move(1, { x: 10, y: 10 });
    expect(tracker.up(1, { x: 10, y: 10 })).toEqual({
      kind: "drop",
      at: { x: 10, y: 10 },
    });
  });

  it("asks what a press grabs only for a press that starts", () => {
    const tracker = new PressTracker<string>();
    let asked = 0;
    const grab = (): string => {
      asked++;
      return "fighter";
    };
    tracker.down(1, { x: 0, y: 0 }, { touch: false, button: 2 }, 0, grab);
    tracker.down(8, { x: 0, y: 0 }, TOUCH, 2, grab);
    expect(asked).toBe(0);
  });

  it("cancels the drag when a second finger goes down", () => {
    const tracker = new PressTracker<string>();
    tracker.down(7, { x: 5, y: 5 }, TOUCH, 1, FIGHTER);
    tracker.move(7, { x: 5, y: 25 });
    expect(tracker.down(8, { x: 90, y: 90 }, TOUCH, 2, FIGHTER)).toEqual({
      kind: "drag-cancel",
    });
    expect(tracker.move(7, { x: 5, y: 60 })).toBeNull();
    expect(tracker.up(7, { x: 5, y: 60 })).toBeNull();
  });

  it("cancels the drag on Esc, and Esc does nothing to a press that is not a drag", () => {
    const tracker = dragging();
    expect(tracker.escape()).toEqual({ kind: "drag-cancel" });
    expect(tracker.up(1, { x: 10, y: 40 })).toBeNull();

    tracker.down(2, { x: 10, y: 10 }, MOUSE, 0, FIGHTER);
    expect(tracker.escape()).toBeNull();
    expect(tracker.up(2, { x: 10, y: 10 })?.kind).toBe("click");
  });

  it("cancels the drag when the browser cancels the pointer", () => {
    const tracker = dragging();
    expect(tracker.cancel(2)).toBeNull();
    expect(tracker.cancel(1)).toEqual({ kind: "drag-cancel" });
    expect(tracker.up(1, { x: 10, y: 40 })).toBeNull();
  });

  it("keeps the drag when a move says another button is down too", () => {
    const tracker = dragging();
    // 3 is the primary and the secondary button.
    expect(tracker.move(1, { x: 10, y: 30 }, 3)).toEqual({
      kind: "drag-move",
      at: { x: 10, y: 30 },
    });
  });

  it("drops when a move says the primary button is up and another is down", () => {
    const tracker = dragging();
    // The browser sends no pointerup for the primary button here, only this move.
    expect(tracker.move(1, { x: 10, y: 30 }, 2)).toEqual({
      kind: "drop",
      at: { x: 10, y: 30 },
    });
    expect(tracker.up(1, { x: 10, y: 30 })).toBeNull();
  });

  it("ends a press that is not a drag when a move says the primary button is up", () => {
    const tracker = new PressTracker<string>();
    tracker.down(1, { x: 10, y: 10 }, MOUSE, 0, FIGHTER);
    expect(tracker.move(1, { x: 10, y: 11 }, 0)).toBeNull();
    expect(tracker.up(1, { x: 10, y: 11 })).toBeNull();
  });

  it("does not read the buttons of a touch move", () => {
    const tracker = new PressTracker<string>();
    tracker.down(7, { x: 5, y: 5 }, TOUCH, 1, FIGHTER);
    expect(tracker.move(7, { x: 5, y: 25 }, 0)?.kind).toBe("drag-start");
  });
});
