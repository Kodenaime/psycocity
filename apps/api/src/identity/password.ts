import { hash, verify, Algorithm } from "@node-rs/argon2";
export async function hashPassword(password: string): Promise<string> {
  return hash(password, { algorithm: Algorithm.Argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
}
export async function verifyPassword(encoded: string, password: string): Promise<boolean> {
  try { return await verify(encoded, password); } catch { return false; }
}
