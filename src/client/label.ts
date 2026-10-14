import { Vector3, type Camera } from "three";

/** A small parchment label that stands above a point of the board. */
export class BoardLabel {
  private readonly element: HTMLElement;
  private readonly anchor = new Vector3();
  private readonly screen = new Vector3();
  private shown = false;

  constructor(parent: HTMLElement = document.body) {
    this.element = document.createElement("div");
    this.element.className = "board-label";
    this.element.setAttribute("role", "status");
    this.element.hidden = true;
    parent.append(this.element);
  }

  /** Shows `text` above the board point `anchor`. Call `place` to move it there. */
  show(text: string, anchor: Vector3): void {
    this.element.textContent = text;
    this.anchor.copy(anchor);
    this.shown = true;
    this.element.hidden = false;
  }

  hide(): void {
    this.shown = false;
    this.element.hidden = true;
  }

  /** Moves the label to its anchor in a view of this size, in CSS pixels. Call it on each draw. */
  place(camera: Camera, width: number, height: number): void {
    if (!this.shown) return;
    this.screen.copy(this.anchor).project(camera);
    const x = ((this.screen.x + 1) / 2) * width;
    const y = ((1 - this.screen.y) / 2) * height;
    this.element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
  }
}
