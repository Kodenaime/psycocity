import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { v2 as cloudinary } from "cloudinary";
import { localDirectory } from "../mail/crypto.js";
export type ImageVariants = { image: Buffer; thumb: Buffer };
export type PrivateStorage = { write: (key: string, values: ImageVariants) => Promise<void>; read: (key: string, variant: keyof ImageVariants) => Promise<Buffer>; remove: (key: string) => Promise<void> };
function checkKey(key: string) { if (!/^[0-9a-f-]{36}$/.test(key)) throw new Error("Invalid storage reference"); }
export function localPrivateStorage(mode: string, directory = `${localDirectory}/media`): PrivateStorage {
  if (mode === "production") throw new Error("Local media storage is forbidden in production");
  const path = (key: string, variant: string) => { checkKey(key); return `${directory}/${key}-${variant}.webp`; };
  return {
    async write(key, values) { await mkdir(directory, { recursive: true, mode: 0o700 }); for (const variant of ["image", "thumb"] as const) await writeFile(path(key, variant), values[variant], { flag: "wx", mode: 0o600 }); },
    read: (key, variant) => readFile(path(key, variant)),
    async remove(key) { for (const variant of ["image", "thumb"]) { try { await unlink(path(key, variant)); } catch (error) { if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw new Error("Private asset cleanup failed", { cause: error }); } } },
  };
}
export function createStorage(env: Record<string, string | undefined>, mode: string): PrivateStorage | null {
  const driver = env.STORAGE_DRIVER ?? (mode === "production" ? "disabled" : "local");
  if (driver === "disabled") return null;
  if (driver === "local") return localPrivateStorage(mode);
  if (driver !== "cloudinary" || !env.CLOUDINARY_CLOUD_NAME || !/^[a-zA-Z0-9_-]+$/.test(env.CLOUDINARY_CLOUD_NAME) || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) throw new Error("Cloudinary requires valid storage configuration");
  cloudinary.config({ cloud_name: env.CLOUDINARY_CLOUD_NAME, api_key: env.CLOUDINARY_API_KEY, api_secret: env.CLOUDINARY_API_SECRET, secure: true });
  const publicId = (key: string, variant: string) => { checkKey(key); return `psycocity/private/${key}-${variant}`; };
  return {
    async write(key, values) {
      for (const variant of ["image", "thumb"] as const) await new Promise<void>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({ public_id: publicId(key, variant), resource_type: "image", type: "authenticated", overwrite: false, timeout: 15000 }, error => error ? reject(new Error("Private image storage failed")) : resolve());
        stream.end(values[variant]);
      });
    },
    async read(key, variant) {
      const url = cloudinary.url(publicId(key, variant), { resource_type: "image", type: "authenticated", format: "webp", secure: true, sign_url: true });
      const response = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: "error" });
      if (!response.ok) throw new Error("Private image retrieval failed");
      return Buffer.from(await response.arrayBuffer());
    },
    async remove(key) { for (const variant of ["image", "thumb"]) await cloudinary.uploader.destroy(publicId(key, variant), { resource_type: "image", type: "authenticated", invalidate: true }); },
  };
}
