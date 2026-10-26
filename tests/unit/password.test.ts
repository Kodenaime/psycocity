import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../apps/api/src/identity/password.js";

describe("actual Argon2id password service", () => {
  it("salts hashes and verifies only the intended password", async () => {
    const first = await hashPassword("a long private test passphrase");
    const second = await hashPassword("a long private test passphrase");
    expect(first).toMatch(/^\$argon2id\$/);
    expect(first).not.toBe(second);
    expect(first).not.toContain("private test");
    expect(await verifyPassword(first, "a long private test passphrase")).toBe(true);
    expect(await verifyPassword(first, "incorrect passphrase")).toBe(false);
  });
  it("does not accept corrupt stored hashes", async () => {
    expect(await verifyPassword("invalid", "password")).toBe(false);
  });
});
