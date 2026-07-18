import { compressVideo } from "./videoCompression";
import { MAX_VIDEO_SIZE_BYTES } from "@/config";

// Below this, compression isn't worth the time/quality cost -- small clips
// almost always fit under the limit already.
const COMPRESSION_THRESHOLD_BYTES = 8 * 1024 * 1024;

export function formatMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

export interface PrepareVideoResult {
  file: File | null;
  error: string | null;
  wasCompressed: boolean;
}

/**
 * Compresses `file` if it's large enough to be worth it, then checks it fits
 * under MAX_VIDEO_SIZE_BYTES. Returns an error message (and no file) if it's
 * still too big -- the caller should surface that to the admin rather than
 * attempt the upload, since Supabase will otherwise reject it with a much
 * less useful "Payload too large" response.
 */
export async function prepareVideoForUpload(file: File): Promise<PrepareVideoResult> {
  let working = file;
  let wasCompressed = false;

  if (file.size > COMPRESSION_THRESHOLD_BYTES) {
    try {
      working = await compressVideo(file);
      wasCompressed = working !== file;
    } catch {
      working = file;
    }
  }

  if (working.size > MAX_VIDEO_SIZE_BYTES) {
    return {
      file: null,
      wasCompressed,
      error: `Video is too large (${formatMB(working.size)}MB${wasCompressed ? " even after compression" : ""}, max ${formatMB(MAX_VIDEO_SIZE_BYTES)}MB). Try a shorter clip or lower resolution.`,
    };
  }

  return { file: working, error: null, wasCompressed };
}

/** For catching the raw Supabase storage error as a fallback, in case a video
 * somehow reaches the upload call without going through prepareVideoForUpload's
 * size check above. */
export function isPayloadTooLargeError(error: { message?: string; statusCode?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.statusCode === "413" || /payload too large|exceeded the maximum allowed size/i.test(error.message ?? "");
}
