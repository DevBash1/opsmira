// Pasted and dropped images, ready to send: downscaled so the longest edge is at most 1568px
// (what vision models actually look at), then encoded as WebP (JPEG where WebP isn't available).

export const MAX_IMAGES = 4;
const MAX_EDGE = 1568;
const QUALITY = 0.85;

/** Image files carried by a paste or a drop. */
export function imageFiles(data: DataTransfer | null): File[] {
  if (!data) return [];
  const fromItems = [...data.items]
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => !!file);
  return fromItems.length ? fromItems : [...data.files].filter((file) => file.type.startsWith("image/"));
}

/** Whether a drag carries files (so the composer should offer itself as a drop target). */
export function dragHasFiles(data: DataTransfer | null) {
  return !!data && [...data.types].includes("Files");
}

/** Encode up to `room` images as data URLs. Unreadable files are skipped. */
export async function prepareImages(files: File[], room: number): Promise<string[]> {
  const out: string[] = [];
  for (const file of files.slice(0, Math.max(0, room))) {
    try {
      out.push(await encode(file));
    } catch {
      // Not decodable as an image — leave it out.
    }
  }
  return out;
}

async function encode(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const webp = canvas.toDataURL("image/webp", QUALITY);
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", QUALITY);
}
