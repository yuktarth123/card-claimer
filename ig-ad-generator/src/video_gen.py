from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

from .config import ROOT, Settings

FFMPEG = "ffmpeg"


def _require_ffmpeg() -> None:
    if shutil.which(FFMPEG) is None:
        raise RuntimeError(
            "ffmpeg is not installed. It's preinstalled on GitHub Actions ubuntu runners; "
            "for local runs install it via your OS package manager (e.g. `apt install ffmpeg` "
            "or `brew install ffmpeg`)."
        )


def _run(cmd: list[str]) -> None:
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg command failed: {' '.join(cmd)}\n{result.stderr[-3000:]}")


def _ken_burns_segment(image_path: Path, out_path: Path, size: tuple[int, int], fps: int, duration: float) -> None:
    w, h = size
    frames = max(1, round(duration * fps))
    # slow zoom-in (Ken Burns) with a short fade in/out so cuts between cards aren't jarring
    zoompan = f"zoompan=z='min(zoom+0.0006,1.12)':d={frames}:s={w}x{h}:fps={fps}"
    fade_out_start = max(0.0, duration - 0.4)
    vf = f"{zoompan},fade=t=in:st=0:d=0.35,fade=t=out:st={fade_out_start}:d=0.4,format=yuv420p"
    _run(
        [
            FFMPEG,
            "-y",
            "-loop",
            "1",
            "-i",
            str(image_path),
            "-vf",
            vf,
            "-t",
            str(duration),
            "-r",
            str(fps),
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            str(out_path),
        ]
    )


def build_ad_video(story_image_paths: list[Path], settings: Settings, out_path: Path) -> Path:
    """Assembles a Reels-style vertical video from one or more composed story images.

    Uses ffmpeg's zoompan filter for a Ken Burns pan/zoom on each image, concatenates
    them into a slideshow, and mixes in an optional royalty-free background track.
    Entirely free/local -- no paid text-to-video API involved.
    """
    _require_ffmpeg()
    video_cfg = settings.video
    size = tuple(video_cfg.get("size", [1080, 1920]))
    fps = int(video_cfg.get("fps", 30))
    duration = float(video_cfg.get("duration_seconds", 8))

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        segment_paths = []
        for i, image_path in enumerate(story_image_paths):
            seg_path = tmp_path / f"segment_{i:02d}.mp4"
            _ken_burns_segment(image_path, seg_path, size, fps, duration)
            segment_paths.append(seg_path)

        concat_list = tmp_path / "segments.txt"
        concat_list.write_text("".join(f"file '{p}'\n" for p in segment_paths))

        silent_path = tmp_path / "silent.mp4"
        _run(
            [
                FFMPEG,
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(concat_list),
                "-c",
                "copy",
                str(silent_path),
            ]
        )

        out_path.parent.mkdir(parents=True, exist_ok=True)
        music_path = ROOT / video_cfg.get("music_path", "")
        if video_cfg.get("music_path") and music_path.exists():
            _run(
                [
                    FFMPEG,
                    "-y",
                    "-i",
                    str(silent_path),
                    "-stream_loop",
                    "-1",
                    "-i",
                    str(music_path),
                    "-shortest",
                    "-map",
                    "0:v",
                    "-map",
                    "1:a",
                    "-c:v",
                    "copy",
                    "-c:a",
                    "aac",
                    "-b:a",
                    "128k",
                    "-af",
                    "afade=t=in:st=0:d=0.5",
                    str(out_path),
                ]
            )
        else:
            shutil.copyfile(silent_path, out_path)

    return out_path
