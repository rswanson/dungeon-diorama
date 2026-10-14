/**
 * A small read-only view of the board on `window.diorama`
 * (`src/client/hook.ts`). It exists for tests (the Playwright drag test) and
 * for agents that drive a browser. It changes nothing. Each point is in CSS
 * pixels from the top left of the canvas.
 */
export interface Diorama {
  /** True when each sprite of the scene stands on the board. */
  readonly ready: boolean;
  /** The point on the screen of the center of the top of square [x, z], or null for a square off the board. */
  squareScreen(x: number, z: number): { x: number; y: number } | null;
  /** The point on the screen of the middle of a sprite's body, or null for an unknown sprite. */
  spriteScreen(id: string): { x: number; y: number } | null;
  /** The square `[x, z]` where a sprite stands at rest, or null during a drag or a settle, or when it did not load. */
  spriteSquare(id: string): [number, number] | null;
  /** The square `[x, z]` the dragged sprite aims at, or null when no drag runs or the pointer is off the board. */
  dragTarget(): [number, number] | null;
}
