/**
 * True for a key in a text field or another editable control, for example the
 * dice input. There, Q, E and Esc are text keys, so the board does not act on
 * them.
 */
export function inTextField(e: KeyboardEvent): boolean {
  return (
    e.target instanceof Element &&
    e.target.closest("input, textarea, select, [contenteditable]") !== null
  );
}
