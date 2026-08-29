// One-off maintenance script: re-encodes every photo already sitting in the
// "card-images" storage bucket to a capped-size JPEG, in place (same path,
// same public URL) -- so listings whose photos were uploaded as HEIC (broken
// in every browser's <img>) or as huge multi-MB originals get fixed without
// re-uploading anything by hand or touching the `cards` table.
//
// Needs the project's SERVICE ROLE key (Project Settings -> API in the
// Supabase dashboard), not the publishable/anon key -- the anon key can't
// list or overwrite arbitrary storage objects. Run it once per project:
//
//   SUPABASE_URL="https://xxxx.supabase.co" \
//   SUPABASE_SERVICE_ROLE_KEY="..." \
//   node scripts/fix-existing-photos.mjs
//
// Add DRY_RUN=1 to see what it would do without uploading anything.

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import convert from "heic-convert";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.BUCKET || "card-images";
const DRY_RUN = process.env.DRY_RUN === "1";
const CONCURRENCY = 4;
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 85;
// Already-fine files (small JPEG, already within the size cap) are skipped
// so re-running the script, or running it after a partial failure, doesn't
// keep re-processing everything.
const SKIP_IF_JPEG_UNDER_BYTES = 1_000_000;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (service_role, not anon) env vars first.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function listAllPaths(prefix = "") {
  const paths = [];
  let offset = 0;
  const limit = 100;
  for (;;) {
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const entry of data) {
      const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      // Folders come back with no `id`/metadata; recurse into them.
      if (entry.id == null && entry.metadata == null) {
        paths.push(...(await listAllPaths(fullPath)));
      } else {
        paths.push(fullPath);
      }
    }
    if (data.length < limit) break;
    offset += limit;
  }
  return paths;
}

async function processOne(path) {
  const { data: blob, error: downloadError } = await supabase.storage.from(BUCKET).download(path);
  if (downloadError) return { path, status: "error", detail: downloadError.message };

  const original = Buffer.from(await blob.arrayBuffer());
  let working = original;
  let convertedFromHeic = false;

  let meta;
  try {
    meta = await sharp(working).metadata();
  } catch {
    // sharp can't decode it -- most likely HEIC/HEIF.
    try {
      const jpegArrayBuffer = await convert({ buffer: working, format: "JPEG", quality: 1 });
      working = Buffer.from(jpegArrayBuffer);
      convertedFromHeic = true;
      meta = await sharp(working).metadata();
    } catch (heicErr) {
      return { path, status: "error", detail: `Unrecognized/undecodable format: ${heicErr.message}` };
    }
  }

  const alreadyFine =
    !convertedFromHeic &&
    meta.format === "jpeg" &&
    (meta.width ?? 0) <= MAX_DIMENSION &&
    (meta.height ?? 0) <= MAX_DIMENSION &&
    original.byteLength <= SKIP_IF_JPEG_UNDER_BYTES;
  if (alreadyFine) return { path, status: "skipped" };

  const outBuffer = await sharp(working)
    .rotate()
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();

  if (DRY_RUN) {
    return { path, status: convertedFromHeic ? "would-convert-heic" : "would-resize", detail: `${original.byteLength}B -> ${outBuffer.byteLength}B` };
  }

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, outBuffer, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (uploadError) return { path, status: "error", detail: uploadError.message };

  return { path, status: convertedFromHeic ? "converted-heic" : "resized", detail: `${original.byteLength}B -> ${outBuffer.byteLength}B` };
}

async function runPool(items, worker, concurrency) {
  const results = [];
  let next = 0;
  async function runner() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i]);
      const r = results[i];
      console.log(`[${r.status}] ${r.path}${r.detail ? " -- " + r.detail : ""}`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, runner));
  return results;
}

const paths = await listAllPaths();
console.log(`Found ${paths.length} object(s) in bucket "${BUCKET}"${DRY_RUN ? " (dry run)" : ""}.`);

const results = await runPool(paths, processOne, CONCURRENCY);

const counts = results.reduce((acc, r) => {
  acc[r.status] = (acc[r.status] || 0) + 1;
  return acc;
}, {});
console.log("\nDone:", counts);
