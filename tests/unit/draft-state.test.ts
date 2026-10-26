import { describe, expect, it } from "vitest";
import { draftAnswersSchema } from "@psycocity/validation";
import { draftSignature } from "../../apps/web/app/lib/drafts.js";

describe("saved draft state", () => {
  it("does not mark schema-reordered but equal fields as unsaved", () => {
    const typed = { background: { introduction: "My introduction", experience: "My experience", interests: "Runway", availability: "Weekends" } };
    const parsed = draftAnswersSchema.parse(typed);
    expect(draftSignature("academy", typed)).toBe(draftSignature("academy", parsed));
  });
  it("retains unsaved state for edits made while a save is in flight", () => {
    const sent = { personal: { legalName: "Earlier name" } };
    const newer = { personal: { legalName: "Latest name" } };
    expect(draftSignature("academy", sent)).not.toBe(draftSignature("academy", newer));
    expect(draftSignature("academy", sent)).not.toBe(draftSignature("established", sent));
  });
});
