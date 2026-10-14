import { Vector2, Vector3, type Object3D } from "three";
import type { BoardCamera } from "./camera.js";

/** A small parchment label that stands above an object on the board. */
export class BoardLabel {
  private readonly element: HTMLElement;
  private target: Object3D | null = null;
  private offsetY = 0;
  private readonly anchor = new Vector3();
  private readonly screen = new Vector2();

  constructor(parent: HTMLElement = document.body) {
    this.element = document.createElement("div");
    this.element.className = "board-label";
    this.element.setAttribute("role", "status");
    this.element.hidden = true;
    parent.append(this.element);
  }

  /**
   * Shows `text` above `target`: `offsetY` board units above its position. The
   * label follows the object. Call `place` to move it there.
   */
  show(target: Object3D, offsetY: number, text: string): void {
    this.element.textContent = text;
    this.target = target;
    this.offsetY = offsetY;
    this.element.hidden = false;
  }

  hide(): void {
    this.target = null;
    this.element.hidden = true;
  }

  /** Moves the label to its target in this view. Call it on each draw. */
  place(view: BoardCamera): void {
    if (this.element.hidden || !this.target) return;
    this.target.getWorldPosition(this.anchor).y += this.offsetY;
    const { x, y } = view.screenPoint(this.anchor, this.screen);
    this.element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
  }
}
