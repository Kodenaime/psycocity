import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { maxUploadBytes, prepareImage } from "../../apps/api/src/media/images.js";
import { localPrivateStorage, createStorage } from "../../apps/api/src/media/storage.js";

describe("private image pipeline", () => {
  it("decodes, re-encodes and strips embedded metadata", async () => {
    const original = await sharp({ create: { width: 320, height: 480, channels: 3, background: "#e7db9d" } }).withMetadata({ exif: { IFD0: { Copyright: "private metadata fixture" } } }).png().toBuffer();
    const result = await prepareImage(original, "image/png");
    const metadata = await sharp(result.image).metadata();
    expect(metadata.format).toBe("webp"); expect(metadata.exif).toBeUndefined();
    expect(metadata.width).toBe(320); expect(metadata.height).toBe(480);
    expect((await sharp(result.thumb).metadata()).format).toBe("webp");
  });
  it("rejects malformed, mismatched, too-small and oversized files", async () => {
    await expect(prepareImage(Buffer.from("<script>invalid image</script>"), "image/png")).rejects.toThrow();
    const png = await sharp({ create: { width: 320, height: 480, channels: 3, background: "white" } }).png().toBuffer();
    await expect(prepareImage(png, "image/jpeg")).rejects.toThrow("Use a static");
    const small = await sharp({ create: { width: 10, height: 10, channels: 3, background: "white" } }).png().toBuffer();
    await expect(prepareImage(small, "image/png")).rejects.toThrow("200");
    await expect(prepareImage(Buffer.alloc(maxUploadBytes + 1), "image/png")).rejects.toThrow("10 MB");
  });
  it("forbids local storage in production and refuses unconfigured remote storage", () => {
    expect(() => localPrivateStorage("production")).toThrow("forbidden");
    expect(createStorage({}, "production")).toBeNull();
    expect(() => createStorage({ STORAGE_DRIVER: "cloudinary" }, "production")).toThrow("configuration");
  });
});
