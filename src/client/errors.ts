/** Shows a parchment panel with a heading and an optional list of problems. */
export function showErrorPanel(
  heading: string,
  problems: readonly string[] = [],
): void {
  const panel = document.createElement("section");
  panel.className = "error-panel";
  panel.setAttribute("role", "alert");

  const title = document.createElement("h2");
  title.textContent = heading;
  panel.append(title);

  if (problems.length > 0) {
    const list = document.createElement("ul");
    for (const problem of problems) {
      const item = document.createElement("li");
      item.textContent = problem;
      list.append(item);
    }
    panel.append(list);
  }
  document.body.append(panel);
}
