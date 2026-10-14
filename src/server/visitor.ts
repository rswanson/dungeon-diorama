import { randomUUID } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { getCookie, setCookie } from "hono/cookie";

export const VISITOR_COOKIE = "dd_visitor";
/** 400 days, in seconds: the longest life that browsers keep for a cookie. */
export const VISITOR_MAX_AGE = 400 * 24 * 60 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface VisitorEnv {
  Variables: { visitor: string };
}

/**
 * Gives each request a visitor id, in `c.get("visitor")`. It reads the
 * `dd_visitor` cookie. When the request has none, or one that is not a UUID,
 * it makes a random UUID and sets the cookie. The id is not a secret account:
 * anyone with the cookie sees and changes that visitor's positions.
 */
export function visitor({
  secure,
}: {
  secure: boolean;
}): MiddlewareHandler<VisitorEnv> {
  return async (c, next) => {
    let id = getCookie(c, VISITOR_COOKIE);
    if (!id || !UUID.test(id)) {
      id = randomUUID();
      setCookie(c, VISITOR_COOKIE, id, {
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
        secure,
        maxAge: VISITOR_MAX_AGE,
      });
    }
    c.set("visitor", id.toLowerCase());
    await next();
  };
}
