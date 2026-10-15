/** The time a notice shows, in milliseconds. */
const NOTICE_MS = 4000;

let timer: ReturnType<typeof setTimeout> | undefined;

/**
 * Shows a short parchment notice at the top of the page, for example "Move
 * not saved". It goes after `NOTICE_MS`. A new text goes under the texts that
 * show, with no repeat, and the time starts again. The notice is the `.notice`
 * status element of the page (`index.html`), which stays in the page while it
 * is empty, so a screen reader reads each new text.
 */
export function showNotice(text: string): void {
  const notice = document.querySelector<HTMLElement>(".notice");
  if (!notice) return;
  if (![...notice.children].some((line) => line.textContent === text)) {
    const line = document.createElement("span");
    line.textContent = text;
    notice.append(line);
  }
  clearTimeout(timer);
  timer = setTimeout(() => notice.replaceChildren(), NOTICE_MS);
}
