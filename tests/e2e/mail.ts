import { expect } from "@playwright/test";
import { readFile, readdir, rm } from "node:fs/promises";

const deliveredFiles = new Set<string>();
export async function mailLink(email: string, subject: string) {
  let link = "";
  await expect.poll(async () => {
    const files = await readdir(".local/mail").catch(() => []);
    for (const file of files.filter(value => value.endsWith(".json"))) {
      try {
        const value = JSON.parse(await readFile(`.local/mail/${file}`, "utf8")) as { to: string; subject: string; text: string };
        if (value.to === email && value.subject.includes(subject)) {
          deliveredFiles.add(`.local/mail/${file}`);
          link = value.text.match(/https?:\/\/\S+/)?.[0] ?? "";
          return Boolean(link);
        }
      } catch { /* Wait for atomic/local delivery to finish writing. */ }
    }
    return false;
  }, { timeout: 15_000 }).toBe(true);
  return link;
}
export async function cleanupMailFixtures() {
  for (const file of deliveredFiles) await rm(file, { force: true });
  deliveredFiles.clear();
}
