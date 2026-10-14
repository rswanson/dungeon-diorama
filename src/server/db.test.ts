import { describe, expect, it } from "vitest";
import { message } from "./db.js";

describe("message", () => {
  it("names each error of a failed connect to two addresses", () => {
    const error = new AggregateError(
      [
        new Error("connect ECONNREFUSED ::1:54329"),
        new Error("connect ECONNREFUSED 127.0.0.1:54329"),
      ],
      "",
    );
    expect(message(error)).toBe(
      "connect ECONNREFUSED ::1:54329; connect ECONNREFUSED 127.0.0.1:54329",
    );
  });

  it("gives the code of an error with no message", () => {
    expect(message(Object.assign(new Error(""), { code: "ECONNRESET" }))).toBe(
      "ECONNRESET",
    );
    expect(message("down")).toBe("down");
  });
});
