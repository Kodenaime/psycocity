import type { DraftAnswers } from "@psycocity/validation";

// Schema parsing may reorder properties. Compare values, not insertion order.
export function draftSignature(track: string, answers: DraftAnswers): string {
  return JSON.stringify([track, answers], (_key, value: unknown) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
    }
    return value;
  });
}
