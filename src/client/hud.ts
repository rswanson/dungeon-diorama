/** Shows the Turn left and Turn right buttons and makes them turn the view. */
export function showTurnButtons(turn: (dir: 1 | -1) => void): void {
  const hud = document.querySelector<HTMLElement>(".hud");
  if (!hud) throw new Error("The page has no .hud.");
  for (const button of hud.querySelectorAll<HTMLButtonElement>("[data-turn]")) {
    const dir = button.dataset.turn === "right" ? 1 : -1;
    button.addEventListener("click", () => turn(dir));
  }
  hud.hidden = false;
}
