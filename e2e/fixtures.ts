import { expect, test as base, type Page } from "@playwright/test";
import type { Diorama } from "../src/shared/diorama.js";

// Each test fails when the page threw an error, also after its last step.
export const test = base.extend<{ pageErrors: Error[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: Error[] = [];
      page.on("pageerror", (error) => errors.push(error));
      await use(errors);
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});

type Args<K extends keyof Diorama> = Diorama[K] extends (
  ...args: infer A
) => unknown
  ? A
  : [];
type Result<K extends keyof Diorama> = Diorama[K] extends (
  ...args: never[]
) => infer R
  ? R
  : Diorama[K];

/**
 * Reads `name` from the page's `window.diorama` (src/client/hook.ts), and
 * calls it with `args` when it is a method. It gives null before the page
 * made the hook.
 */
export function hook<K extends keyof Diorama>(
  page: Page,
  name: K,
  ...args: Args<K>
): Promise<Result<K> | null> {
  return page.evaluate(
    ([name, args]) => {
      const diorama = (globalThis as { diorama?: Diorama }).diorama;
      const value: unknown = diorama?.[name];
      return typeof value === "function"
        ? value.apply(diorama, args)
        : (value ?? null);
    },
    [name, args] as const,
  ) as Promise<Result<K> | null>;
}

/** Waits until the board and each sprite show. */
export async function ready(page: Page): Promise<void> {
  // Each sprite stands on the board only when WebGL works.
  await expect
    .poll(() => hook(page, "ready"), {
      message: "the board and its sprites show",
    })
    .toBe(true);
}
