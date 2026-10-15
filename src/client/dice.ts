import { parseInput, type Entry, type Roll } from "../shared/dice.js";
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

  const scrollToNewest = (): void => {
    log.scrollTop = log.scrollHeight;
  };
  // The log items by entry id. The ids only increase.
  const shown = new Map<number, HTMLLIElement>();
  /** Adds the entries that the log does not show, in id order. */
  const addEntries = (entries: Entry[]): void => {
    for (const entry of entries) {
      if (shown.has(entry.id)) continue;
      const item = entryItem(entry);
      const next = [...shown]
        .filter(([id]) => id > entry.id)
        .sort(([a], [b]) => a - b)[0];
      log.insertBefore(item, next ? next[1] : null);
      shown.set(entry.id, item);
    }
    scrollToNewest();
  };

  // A press on the total of a note roll shows or hides its dice.
  log.addEventListener("click", (e) => {
    const total = (e.target as Element).closest(".dice-total");
    if (!total) return;
    const shown = total.getAttribute("aria-expanded") === "true";
    total.setAttribute("aria-expanded", String(!shown));
  });

  const setOpen = (open: boolean): void => {
    panel.hidden = !open;
    sidebar.classList.toggle("open", open);
    // The turn buttons move left of the open sidebar (style.css).
    document.body.classList.toggle("dice-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    // A hidden panel cannot scroll, so the log scrolls when the panel shows.
    if (open) scrollToNewest();
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
      addEntries([result.entry]);
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

  void saved.then((entries) => {
    if (entries) addEntries(entries);
    else showNotice("Saved rolls did not load");
  });
}

/**
 * The log item of an entry and its local time. A roll entry shows the dice and
 * the result line. A note shows its text and the total of each roll.
 */
function entryItem(entry: Entry): HTMLLIElement {
  const item = document.createElement("li");
  item.className = "dice-entry";
  const head = document.createElement("div");
  head.className = "dice-entry-head";
  const time = document.createElement("time");
  time.dateTime = entry.at;
  time.textContent = localTime(entry.at);
  const body = document.createElement("div");
  if (entry.kind === "note") {
    body.className = "dice-note";
    for (const part of entry.parts) {
      // A string goes in the page as a text node, never as HTML.
      body.append("roll" in part ? noteRoll(part.roll) : part.text);
    }
  } else {
    body.className = "dice-line";
    for (const part of entry.parts) {
      if (!("roll" in part)) continue;
      const dice = document.createElement("span");
      dice.className = "dice-dice";
      dice.textContent = part.roll.dice;
      head.append(dice);
      body.append(...rollLine(part.roll).map(segmentNode));
    }
  }
  head.append(time);
  item.append(head, body);
  return item;
}

/**
 * A roll in a note: its total in bold, as a button. A hover on it, or a press
 * (a tap, a click, Enter or Space) shows its dice under it, for example
 * `1d20+5: (17) + 5 = 22` (style.css). A second press hides them.
 */
function noteRoll(roll: Roll): HTMLElement {
  const total = document.createElement("button");
  total.type = "button";
  total.className = "dice-total";
  total.setAttribute("aria-expanded", "false");
  const bold = document.createElement("strong");
  bold.textContent = String(roll.total);
  total.append(bold);
  const detail = document.createElement("span");
  detail.className = "dice-detail";
  detail.append(`${roll.dice}: `, ...rollLine(roll).map(segmentNode));
  const wrap = document.createElement("span");
  wrap.className = "dice-roll";
  wrap.append(total, detail);
  return wrap;
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
