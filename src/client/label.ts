import { Vector2, Vector3, type Object3D } from "three";
import type { BoardCamera } from "./camera.js";
import type { Point, Size } from "./point.js";

/** The space between the pointer and a label at the pointer, in CSS pixels, so a finger does not hide it. */
const POINTER_GAP = 24;

/** `value` in the range 0 to `max`, or 0 when `max` is below 0 (the area is smaller than the label). */
function clamp(value: number, max: number): number {
  return Math.max(0, Math.min(value, max));
}

/**
 * A small parchment label. It stands above an object on the board (`show`),
 * or near the pointer (`showAt`). A label near the pointer stays in the board
 * area, which starts at the top left of the window (the canvas) and has the
 * size that the caller gives.
 */
export class BoardLabel {
  private readonly element: HTMLElement;
  private text: string | null = null;
  /** The size of the label with its text, in CSS pixels, or null until it is measured. */
  private size: { width: number; height: number } | null = null;
  private target: Object3D | null = null;
  private offsetY = 0;
  private readonly anchor = new Vector3();
  private readonly screen = new Vector2();

  constructor({
    className,
    parent = document.body,
  }: { className?: string; parent?: HTMLElement } = {}) {
    this.element = document.createElement("div");
    this.element.className = className
      ? `board-label ${className}`
      : "board-label";
    this.element.setAttribute("role", "status");
    this.element.hidden = true;
    parent.append(this.element);
  }

  /**
   * Shows `text` above `target`: `offsetY` board units above its position. The
   * label follows the object. Call `place` to move it there.
   */
  show(target: Object3D, offsetY: number, text: string): void {
    this.setText(text);
    this.target = target;
    this.offsetY = offsetY;
    this.element.hidden = false;
  }

  /** Shows `text` near the canvas point `at` in a board area of this size. Call `moveTo` when the point moves. */
  showAt(text: string, at: Point, area: Size): void {
    this.setText(text);
    this.target = null;
    this.element.hidden = false;
    this.moveTo(at, area);
  }

  /**
   * Puts a label from `showAt` above and to the right of the canvas point
   * `at`, or to the left of it or below it where the board area (this size)
   * has no room.
   */
  moveTo(at: Point, area: Size): void {
    if (this.element.hidden || this.target) return;
    // The size changes only with the text, so the label is measured once for each text.
    this.size ??= {
      width: this.element.offsetWidth,
      height: this.element.offsetHeight,
    };
    const { width, height } = this.size;
    const right = at.x + POINTER_GAP + width <= area.width;
    const above = at.y - POINTER_GAP - height >= 0;
    // Then keeps the whole label in the area on all four sides.
    const x = clamp(
      right ? at.x + POINTER_GAP : at.x - POINTER_GAP - width,
      area.width - width,
    );
    const y = clamp(
      above ? at.y - POINTER_GAP - height : at.y + POINTER_GAP,
      area.height - height,
    );
    this.element.style.transform = `translate(${x}px, ${y}px)`;
  }

  hide(): void {
    this.target = null;
    this.element.hidden = true;
  }

  /** Moves a label from `show` to its target in this view. Call it on each draw. */
  place(view: BoardCamera): void {
    if (this.element.hidden || !this.target) return;
    this.target.getWorldPosition(this.anchor).y += this.offsetY;
    const { x, y } = view.screenPoint(this.anchor, this.screen);
    this.element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
  }

  /** Writes the text only when it changes. */
  private setText(text: string): void {
    if (text === this.text) return;
    this.text = text;
    this.element.textContent = text;
    this.size = null;
  }
}
