import sharp from "sharp";
export const maxUploadBytes = 10 * 1024 * 1024;
export async function prepareImage(bytes: Buffer, declaredType: string) {
  if (bytes.length > maxUploadBytes) throw new Error("Image exceeds the 10 MB limit");
  const image = sharp(bytes, { limitInputPixels: 40_000_000, failOn: "error" });
  const metadata = await image.metadata();
  const expected = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
  if (!metadata.format || !(metadata.format in expected) || expected[metadata.format as keyof typeof expected] !== declaredType || (metadata.pages ?? 1) > 1 || !metadata.width || !metadata.height || metadata.width < 200 || metadata.height < 200) throw new Error("Use a static JPEG, PNG or WebP image at least 200 × 200 pixels");
  // Re-encoding without withMetadata removes EXIF/GPS and appended executable data.
  const normalized = await image.rotate().resize({ width: 2000, height: 3000, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer({ resolveWithObject: true });
  const thumb = await sharp(normalized.data).resize({ width: 480, height: 640, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  return { image: normalized.data, thumb, width: normalized.info.width, height: normalized.info.height, bytes: normalized.data.length };
}
