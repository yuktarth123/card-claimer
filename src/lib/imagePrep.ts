// Photos land here straight from admins' phones -- often HEIC (iPhone's default
// camera-roll format) at full camera resolution (3-8MB, 3000-4000px wide).
// No browser renders HEIC in <img>, so those listings show as broken images
// for every visitor, and the oversized JPEGs that do render are heavy to
// decode while scrolling a grid of many listings. Re-encoding everything to a
// capped-size JPEG before upload fixes both at the source.
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

function looksLikeHeic(file: File): boolean {
  return /\.(heic|heif)$/i.test(file.name) || /^image\/(heic|heif)/i.test(file.type);
}

export async function prepareImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/") && !looksLikeHeic(file)) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    if (looksLikeHeic(file)) {
      throw new Error(
        'This photo is in Apple\'s HEIC format, which browsers can\'t display. On iPhone: Settings → Camera → Formats → "Most Compatible", then re-take or re-select the photo and try again.'
      );
    }
    return file;
  }

  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob) return file;

    const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}
