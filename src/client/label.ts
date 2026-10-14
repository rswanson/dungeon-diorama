import { Vector2, Vector3, type Object3D } from "three";
import type { BoardCamera } from "./camera.js";
import type { Point } from "./point.js";

/** The space between the pointer and a label at the pointer, in CSS pixels, so a finger does not hide it. */
const POINTER_GAP = 24;

/**
 * A small parchment label. It stands above an object on the board (`show`),
 * or near the pointer (`showAt`).
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

  /** Shows `text` near the canvas point `at`. Call `moveTo` when the point moves. */
  showAt(text: string, at: Point): void {
    this.setText(text);
    this.target = null;
    this.element.hidden = false;
    this.moveTo(at);
  }

  /**
   * Puts a label from `showAt` above and to the right of the canvas point
   * `at`, or to the left of it or below it where the window has no room.
   */
  moveTo(at: Point): void {
    if (this.element.hidden || this.target) return;
    // The size changes only with the text, so the label is measured once for each text.
    this.size ??= {
      width: this.element.offsetWidth,
      height: this.element.offsetHeight,
    };
    const { width, height } = this.size;
    const right = at.x + POINTER_GAP + width <= window.innerWidth;
    const above = at.y - POINTER_GAP - height >= 0;
    const x = Math.max(
      0,
      right ? at.x + POINTER_GAP : at.x - POINTER_GAP - width,
    );
    const y = Math.max(
      0,
      above ? at.y - POINTER_GAP - height : at.y + POINTER_GAP,
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
