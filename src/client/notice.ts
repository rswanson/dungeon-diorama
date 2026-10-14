/** The time a notice shows, in milliseconds. */
export const NOTICE_MS = 4000;

let timer: ReturnType<typeof setTimeout> | undefined;

/**
 * Shows a short parchment notice at the top of the page, for example "Move
 * not saved". It goes after `NOTICE_MS`. A new notice takes the place of the
 * one that shows. The notice is the `.notice` status element of the page,
 * which stays in the page while it is empty, so a screen reader reads each
 * new text.
 */
export function showNotice(text: string): void {
  let notice = document.querySelector<HTMLElement>(".notice");
  if (!notice) {
    notice = document.createElement("p");
    notice.className = "notice";
    notice.setAttribute("role", "status");
    document.body.append(notice);
  }
  const shown = notice;
  shown.textContent = text;
  clearTimeout(timer);
  timer = setTimeout(() => {
    shown.textContent = "";
  }, NOTICE_MS);
}
