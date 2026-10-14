/** The time a notice shows, in milliseconds. */
const NOTICE_MS = 4000;

let timer: ReturnType<typeof setTimeout> | undefined;

/**
 * Shows a short parchment notice at the top of the page, for example "Move
 * not saved". It goes after `NOTICE_MS`. A new notice takes the place of the
 * one that shows. The notice is the `.notice` status element of the page
 * (`index.html`), which stays in the page while it is empty, so a screen
 * reader reads each new text.
 */
export function showNotice(text: string): void {
  const notice = document.querySelector<HTMLElement>(".notice");
  if (!notice) return;
  notice.textContent = text;
  clearTimeout(timer);
  timer = setTimeout(() => {
    notice.textContent = "";
  }, NOTICE_MS);
}
