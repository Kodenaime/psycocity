import { describe, expect, it } from "vitest";
import { parsePort } from "../../apps/api/src/port.js";

describe("API listen port", () => {
  it("uses the documented default when absent", () => {
    expect(parsePort(undefined)).toBe(3001);
  });
  it.each(["1", "3101", "65535"])("accepts valid port %s", (value) => {
    expect(parsePort(value)).toBe(Number(value));
  });
  it.each(["", "0", "-1", "65536", "3001.5", "invalid", "NaN", "Infinity"])("rejects invalid port %j", (value) => {
    expect(() => parsePort(value)).toThrow("PORT must be an integer between 1 and 65535");
  });
});
