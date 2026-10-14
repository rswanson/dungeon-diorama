import { onBoard, squareKey, type Square } from "../shared/scene.js";

// Where each sprite stands. It has no DOM and no three.js, so a test can run it
// in Node. The scene file gives the start layout.

/** The size of the board, in squares. */
interface BoardSize {
  width: number;
  depth: number;
}

/** The record of the square of each sprite. One sprite stands on each square at most. */
export class BoardState {
  private readonly squares = new Map<string, Square>();

  constructor(
    private readonly size: BoardSize,
    sprites: readonly { id: string; at: readonly [number, number] }[],
  ) {
    for (const { id, at } of sprites) {
      this.squares.set(id, { x: at[0], z: at[1] });
    }
  }

  /** The square of a sprite, or undefined for an unknown id. */
  squareOf(id: string): Square | undefined {
    const square = this.squares.get(id);
    return square && { ...square };
  }

  /** The id of the sprite on square [x, z], or null when the square is free. */
  occupant(x: number, z: number): string | null {
    for (const [id, square] of this.squares) {
      if (square.x === x && square.z === z) return id;
    }
    return null;
  }

  /**
   * The squares of every sprite but `id`, one byte for each square at
   * `z * width + x`: 1 where another sprite stands, else 0. It makes an array
   * of width * depth bytes for each call, and it marks the squares of the other
   * sprites, so the cost is the size of the board plus the number of sprites.
   */
  occupiedExcept(id: string): Uint8Array {
    const occupied = new Uint8Array(this.size.width * this.size.depth);
    for (const [other, { x, z }] of this.squares) {
      if (other !== id) occupied[z * this.size.width + x] = 1;
    }
    return occupied;
  }

  onBoard(square: Square): boolean {
    return onBoard(this.size, square);
  }

  /**
   * True when the sprite can stand on `to`: the square is on the board and no
   * other sprite stands on it. Its own square is true: a move there changes
   * nothing.
   */
  canMove(id: string, to: Square): boolean {
    if (!this.squares.has(id) || !this.onBoard(to)) return false;
    const other = this.occupant(to.x, to.z);
    return other === null || other === id;
  }

  /**
   * Puts each sprite on its square in `layout`, by sprite id, all at once. A
   * sprite that `layout` does not list stays where it is. It throws, and
   * changes nothing, when the result puts a sprite off the board or two
   * sprites on one square.
   */
  place(layout: Readonly<Record<string, readonly [number, number]>>): void {
    const next = new Map(this.squares);
    for (const id of this.squares.keys()) {
      if (!Object.hasOwn(layout, id)) continue;
      const [x, z] = layout[id];
      next.set(id, { x, z });
    }
    const seen = new Set<string>();
    for (const [id, square] of next) {
      const key = squareKey(square);
      if (!this.onBoard(square) || seen.has(key)) {
        throw new Error(
          `The layout cannot put "${id}" on square [${square.x}, ${square.z}].`,
        );
      }
      seen.add(key);
    }
    for (const [id, square] of next) this.squares.set(id, square);
  }

  /** Puts the sprite on `to`. It throws when `canMove` is false. */
  move(id: string, to: Square): void {
    if (!this.canMove(id, to)) {
      throw new Error(
        `The sprite "${id}" cannot move to square [${to.x}, ${to.z}].`,
      );
    }
    this.squares.set(id, { x: to.x, z: to.z });
  }
}
