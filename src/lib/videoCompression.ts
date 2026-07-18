// Client-side video compression using native browser APIs (canvas + MediaRecorder)
// -- no ffmpeg.wasm or other heavy dependency. Re-encodes by playing the source
// video into an offscreen canvas at a capped resolution/bitrate while recording
// the canvas (plus the original audio track, if any) with MediaRecorder.
//
// Trade-off worth knowing: MediaRecorder can only emit formats the browser
// supports encoding, which today usually means WebM (Chrome/Firefox/Android) or,
// on newer Safari, MP4. We prefer MP4 when available for broader playback
// compatibility (older iOS Safari doesn't play WebM), falling back to WebM
// otherwise. If neither is supported, or anything about compression fails, we
// return the original file untouched -- the caller's size-limit check is the
// real safety net, this is a best-effort size reduction.

const SUPPORTED_MIME_CANDIDATES = [
  "video/mp4;codecs=avc1,mp4a",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

function pickSupportedMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return SUPPORTED_MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

export function isVideoCompressionSupported(): boolean {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement !== "undefined" &&
    typeof (HTMLCanvasElement.prototype as any).captureStream === "function" &&
    pickSupportedMimeType() !== null
  );
}

interface CompressOptions {
  maxDimension?: number; // longest side, in px
  videoBitsPerSecond?: number;
}

// Hides an element visually without display:none -- some browsers pause
// rendering/capture for display:none elements, and captureStream()/drawImage()
// need the video actually decoding frames.
function hideOffscreen(el: HTMLElement) {
  el.style.position = "fixed";
  el.style.top = "0";
  el.style.left = "0";
  el.style.width = "1px";
  el.style.height = "1px";
  el.style.opacity = "0";
  el.style.pointerEvents = "none";
  el.style.zIndex = "-1";
}

/**
 * Re-encodes `file` at a lower resolution/bitrate. Returns the original file
 * unchanged if compression isn't supported, fails, times out, or doesn't
 * actually help.
 */
export async function compressVideo(file: File, options: CompressOptions = {}): Promise<File> {
  const maxDimension = options.maxDimension ?? 960;
  const videoBitsPerSecond = options.videoBitsPerSecond ?? 1_500_000;

  const mimeType = pickSupportedMimeType();
  if (!mimeType || !isVideoCompressionSupported()) return file;

  const objectUrl = URL.createObjectURL(file);
  const videoEl = document.createElement("video");
  videoEl.muted = true;
  videoEl.playsInline = true;
  videoEl.src = objectUrl;
  hideOffscreen(videoEl);
  // Some browsers only fire loadedmetadata/play/ended reliably, and only let
  // captureStream() produce live frames, for elements that are actually in
  // the document -- a detached <video> can silently never fire "ended".
  document.body.appendChild(videoEl);

  let canvas: HTMLCanvasElement | null = null;
  let drawIntervalId: ReturnType<typeof setInterval> | undefined;

  try {
    await new Promise<void>((resolve, reject) => {
      videoEl.onloadedmetadata = () => resolve();
      videoEl.onerror = () => reject(new Error("Failed to read video metadata"));
    });

    const { videoWidth, videoHeight, duration } = videoEl;
    if (!videoWidth || !videoHeight || !isFinite(duration) || duration <= 0) {
      return file;
    }

    const scale = Math.min(1, maxDimension / Math.max(videoWidth, videoHeight));
    const outWidth = Math.max(2, Math.round((videoWidth * scale) / 2) * 2);
    const outHeight = Math.max(2, Math.round((videoHeight * scale) / 2) * 2);

    canvas = document.createElement("canvas");
    canvas.width = outWidth;
    canvas.height = outHeight;
    hideOffscreen(canvas);
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    const canvasStream = (canvas as any).captureStream(30) as MediaStream;

    let outputStream = canvasStream;
    try {
      const sourceStream: MediaStream | undefined = (videoEl as any).captureStream?.();
      const audioTracks = sourceStream?.getAudioTracks() ?? [];
      if (audioTracks.length > 0) {
        outputStream = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);
      }
    } catch {
      // No audio track available -- video-only output is fine.
    }

    const recorder = new MediaRecorder(outputStream, { mimeType, videoBitsPerSecond });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    const recordingDone = new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
      recorder.onerror = () => reject(new Error("Recording failed"));
    });

    // A setInterval-driven draw loop rather than requestAnimationFrame: this
    // canvas is never actually shown to anyone, so there's no need to sync
    // with display refresh -- and rAF can be throttled/suspended for
    // backgrounded or non-visible tabs in some browsers, which would stall
    // compression if an admin switches away mid-upload. A fixed timer isn't
    // subject to the same throttling.
    const drawFrame = () => ctx.drawImage(videoEl, 0, 0, outWidth, outHeight);

    // Hard cap so a stalled/blocked playback (autoplay policy, corrupt file,
    // browser quirk, etc.) can never hang the admin's upload flow forever --
    // worst case we just fall back to the original file.
    const timeoutMs = Math.min(120_000, Math.max(10_000, duration * 1000 * 2 + 5_000));
    const playbackEnded = Promise.race([
      new Promise<void>((resolve) => {
        videoEl.onended = () => resolve();
      }),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);

    recorder.start();
    videoEl.currentTime = 0;
    await videoEl.play();
    drawIntervalId = setInterval(drawFrame, 1000 / 30);

    await playbackEnded;
    clearInterval(drawIntervalId);
    videoEl.pause();
    if (recorder.state !== "inactive") recorder.stop();

    const blob = await recordingDone;
    if (blob.size === 0 || blob.size >= file.size) {
      // Compression didn't help (or produced nothing usable, e.g. the
      // timeout fired before real playback completed) -- keep the original.
      return file;
    }

    const extension = mimeType.startsWith("video/mp4") ? "mp4" : "webm";
    const newName = file.name.replace(/\.[^./\\]+$/, "") + `.${extension}`;
    return new File([blob], newName, { type: mimeType });
  } catch {
    return file;
  } finally {
    clearInterval(drawIntervalId);
    videoEl.remove();
    canvas?.remove();
    URL.revokeObjectURL(objectUrl);
  }
}
