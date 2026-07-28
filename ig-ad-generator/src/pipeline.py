from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

from .config import ROOT, Settings, load_settings
from .copywriter import AdCopy, generate_copy
from .data_source import Card, fetch_cards
from .image_gen import build_ad_images
from .instagram_publish import publish_image, publish_reel
from .storage import upload_file
from .video_gen import build_ad_video

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("ig-ad-generator")


def _combined_video_caption(cards: list[Card], settings: Settings) -> str:
    names = ", ".join(c.name for c in cards)
    website = settings.brand.get("website", "")
    hashtags = " ".join(settings.copy.get("extra_hashtags", []))
    return f"New drops: {names}\nClaim yours before they're gone -> link in bio ({website})\n\n{hashtags}".strip()


def run() -> None:
    load_dotenv(ROOT / ".env")
    settings = load_settings()

    run_dir = ROOT / "output" / datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    run_dir.mkdir(parents=True, exist_ok=True)

    log.info("Fetching candidate cards from Supabase (strategy=%s)...", settings.selection.get("strategy"))
    cards = fetch_cards(settings)
    if not cards:
        log.warning("No cards matched the selection strategy -- nothing to generate this run.")
        return
    log.info("Selected %d card(s): %s", len(cards), ", ".join(c.name for c in cards))

    per_card_copy: dict[str, AdCopy] = {}
    story_images: list[Path] = []
    feed_images: dict[str, Path] = {}

    for card in cards:
        copy = generate_copy(card, settings)
        per_card_copy[card.id] = copy
        log.info("Generating images for %s...", card.name)
        images = build_ad_images(card, copy, settings, run_dir)
        feed_images[card.id] = images["feed"]
        story_images.append(images["story"])

    video_path = None
    if settings.video.get("enabled", True) and story_images:
        log.info("Assembling video from %d image(s)...", len(story_images))
        video_path = build_ad_video(story_images, settings, run_dir / "ad_reel.mp4")
        log.info("Video written to %s", video_path)

    if not settings.publish.get("auto_publish", False):
        log.info(
            "auto_publish is false in config.yaml -- generated assets are in %s for review. "
            "Set publish.auto_publish: true once you're happy with the output.",
            run_dir,
        )
        return

    post_type = settings.publish.get("post_type", "image_and_reel")
    stamp = run_dir.name

    if post_type in ("image_and_reel", "image_only"):
        for card in cards:
            copy = per_card_copy[card.id]
            remote_path = f"{stamp}/{card.id}_feed.jpg"
            log.info("Uploading feed image for %s...", card.name)
            public_url = upload_file(settings, feed_images[card.id], remote_path)
            log.info("Publishing feed post for %s...", card.name)
            media_id = publish_image(public_url, copy.full_caption, settings)
            log.info("Published image post %s for %s", media_id, card.name)

    if post_type in ("image_and_reel", "reel_only") and video_path is not None:
        remote_path = f"{stamp}/ad_reel.mp4"
        log.info("Uploading reel video...")
        public_url = upload_file(settings, video_path, remote_path)
        log.info("Publishing reel...")
        media_id = publish_reel(public_url, _combined_video_caption(cards, settings), settings)
        log.info("Published reel %s", media_id)


if __name__ == "__main__":
    run()
