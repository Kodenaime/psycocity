import type { DraftAnswers } from "@psycocity/validation";
export function changedAnswerPaths(previous: DraftAnswers, next: DraftAnswers): string[] {
  const paths: string[] = [];
  function visit(left: unknown, right: unknown, path: string) {
    if ((left && typeof left === "object") || (right && typeof right === "object")) {
      const before = left && typeof left === "object" ? left as Record<string, unknown> : {};
      const after = right && typeof right === "object" ? right as Record<string, unknown> : {};
      for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) visit(before[key], after[key], path ? `${path}.${key}` : key);
    } else if (left !== right) paths.push(path);
  }
  visit(previous, next, ""); return paths;
}
export function photoEditable(application: { status: string; correctionFields?: string[] }, slot: string) {
  return application.status === "draft" || (application.status === "corrections_requested" && Boolean(application.correctionFields?.includes(`photos.${slot}`)));
}
