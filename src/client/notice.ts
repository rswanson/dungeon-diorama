/** The time a notice shows, in milliseconds. */
const NOTICE_MS = 4000;

let timer: ReturnType<typeof setTimeout> | undefined;

/** The texts that show now, one for each line. */
let lines: string[] = [];

/**
 * Shows a short parchment notice at the top of the page, for example "Move
 * not saved". It goes after `NOTICE_MS`. A new text goes under the texts that
 * show, with no repeat, and the time starts again. The notice is the `.notice` status element of the page
 * (`index.html`), which stays in the page while it is empty, so a screen
 * reader reads each new text.
 */
export function showNotice(text: string): void {
  const notice = document.querySelector<HTMLElement>(".notice");
  if (!notice) return;
  if (!lines.includes(text)) lines.push(text);
  notice.textContent = lines.join("\n");
  clearTimeout(timer);
  timer = setTimeout(() => {
    lines = [];
    notice.textContent = "";
  }, NOTICE_MS);
}
