import { parseInput, type Entry } from "../shared/dice.js";
import { sendRoll } from "./api.js";
import { localTime, rollLine, type LineSegment } from "./diceline.js";
import { showNotice } from "./notice.js";

/** The sidebar is open at the start on a window this wide or wider. */
const OPEN_AT_START = "(min-width: 768px)";

/**
 * Shows the dice sidebar (`.dice` in `index.html`) for `scene`: its log, its
 * error line and its input. `saved` gives this visitor's saved entries, oldest
 * first, or null when they did not load. Enter in the input sends the text,
 * and the server rolls and saves it. All text goes in the page as text, never
 * as HTML.
 */
export function showDiceSidebar(
  scene: string,
  saved: Promise<Entry[] | null>,
): void {
  const sidebar = document.querySelector<HTMLElement>(".dice");
  const toggle = sidebar?.querySelector<HTMLButtonElement>(".dice-toggle");
  const panel = sidebar?.querySelector<HTMLElement>(".dice-panel");
  const log = sidebar?.querySelector<HTMLOListElement>(".dice-log");
  const errorLine = sidebar?.querySelector<HTMLElement>(".dice-error");
  const input = sidebar?.querySelector<HTMLInputElement>(".dice-input");
  if (!sidebar || !toggle || !panel || !log || !errorLine || !input) {
    throw new Error("The page has no dice sidebar.");
  }

  const setOpen = (open: boolean): void => {
    panel.hidden = !open;
    sidebar.classList.toggle("open", open);
    // The turn buttons move left of the open sidebar (style.css).
    document.body.classList.toggle("dice-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    // A hidden panel cannot scroll, so the log shows its newest entry when
    // the panel shows.
    if (open) log.scrollTop = log.scrollHeight;
  };
  toggle.addEventListener("click", () =>
    setOpen(toggle.getAttribute("aria-expanded") !== "true"),
  );
  // A later resize does not open or close it.
  setOpen(window.matchMedia(OPEN_AT_START).matches);

  const send = async (): Promise<void> => {
    // The text that the person typed stays in the input. The request has the trimmed text.
    const text = input.value.trim();
    const parsed = parseInput(text);
    if (parsed.kind === "empty") return;
    if (parsed.kind === "error") {
      errorLine.textContent = parsed.error;
      return;
    }
    // The text cannot change while it sends, so a 201 clears what was sent.
    input.readOnly = true;
    errorLine.textContent = "";
    try {
      const result = await sendRoll(scene, text);
      if (!result.ok) {
        errorLine.textContent = result.error;
        return;
      }
      log.append(entryItem(result.entry));
      log.scrollTop = log.scrollHeight;
      input.value = "";
    } finally {
      input.readOnly = false;
    }
  };

  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.isComposing) return;
    e.preventDefault();
    // During a send, a second Enter does nothing.
    if (!input.readOnly) void send();
  });

  sidebar.hidden = false;

  // An entry sent before the log loads stays at the bottom: the saved entries
  // go above it, less the ones that it already shows.
  void saved.then((entries) => {
    if (!entries) {
      showNotice("Saved rolls did not load");
      return;
    }
    const shown = new Set(
      [...log.children].map((item) => (item as HTMLElement).dataset.id),
    );
    let items: HTMLLIElement[];
    try {
      items = entries
        .filter((entry) => !shown.has(String(entry.id)))
        .map(entryItem);
    } catch (error) {
      // A bad entry counts as a failed load. The log stays as it was.
      console.warn("The saved rolls have a wrong shape:", error);
      showNotice("Saved rolls did not load");
      return;
    }
    log.prepend(...items);
    log.scrollTop = log.scrollHeight;
  });
}

/** The log item of an entry: the dice, its result line and the local time. */
function entryItem(entry: Entry): HTMLLIElement {
  const item = document.createElement("li");
  item.className = "dice-entry";
  item.dataset.id = String(entry.id);
  const head = document.createElement("div");
  head.className = "dice-entry-head";
  const line = document.createElement("div");
  line.className = "dice-line";
  for (const part of entry.parts) {
    if (!("roll" in part)) continue;
    const dice = document.createElement("span");
    dice.className = "dice-dice";
    dice.textContent = part.roll.dice;
    head.append(dice);
    line.append(...rollLine(part.roll).map(segmentNode));
  }
  const time = document.createElement("time");
  time.dateTime = entry.at;
  time.textContent = localTime(entry.at);
  head.append(time);
  item.append(head, line);
  return item;
}

function segmentNode({ text, style }: LineSegment): Node {
  if (!style) return document.createTextNode(text);
  let node: HTMLElement;
  if (style === "total") {
    node = document.createElement("strong");
  } else {
    node = document.createElement("span");
    node.className = `die-${style}`;
  }
  node.textContent = text;
  return node;
}
