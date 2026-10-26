import { describe, expect, it } from "vitest";
import { ageOn, lagosDate, birthDateSchema, saveApplicationSchema } from "@psycocity/validation";

describe("application boundaries", () => {
  it("uses the Nigerian business date at the UTC boundary", () => {
    expect(lagosDate(new Date("2026-10-24T23:30:00Z"))).toBe("2026-10-25");
  });
  it("changes eligibility on the birthday rather than the birth year alone", () => {
    expect(ageOn("2010-10-25", "2026-10-24")).toBe(15);
    expect(ageOn("2010-10-25", "2026-10-25")).toBe(16);
    expect(ageOn("2008-10-25", "2026-10-24")).toBe(17);
    expect(ageOn("2008-10-25", "2026-10-25")).toBe(18);
  });
  it("accepts incomplete drafts but rejects impossible dates, injected states and invalid numeric values", () => {
    expect(saveApplicationSchema.safeParse({ version: 0, answers: {} }).success).toBe(true);
    expect(birthDateSchema.safeParse("2020-02-30").success).toBe(false);
    expect(birthDateSchema.safeParse("9999-01-01").success).toBe(false);
    expect(saveApplicationSchema.safeParse({ version: 0, answers: {}, status: "accepted" }).success).toBe(false);
    expect(saveApplicationSchema.safeParse({ version: 0, answers: { measurements: { heightCm: -10 } } }).success).toBe(false);
  });
});
