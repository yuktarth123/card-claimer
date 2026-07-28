from __future__ import annotations

import time

import requests

from .config import Settings

GRAPH_API_BASE = "https://graph.facebook.com/v21.0"


class InstagramPublishError(RuntimeError):
    pass


def _post(path: str, settings: Settings, **params) -> dict:
    resp = requests.post(
        f"{GRAPH_API_BASE}/{path}",
        data={**params, "access_token": settings.ig_access_token},
        timeout=60,
    )
    body = resp.json()
    if not resp.ok or "error" in body:
        raise InstagramPublishError(f"Graph API error on {path}: {body}")
    return body


def _get(path: str, settings: Settings, **params) -> dict:
    resp = requests.get(
        f"{GRAPH_API_BASE}/{path}",
        params={**params, "access_token": settings.ig_access_token},
        timeout=30,
    )
    body = resp.json()
    if not resp.ok or "error" in body:
        raise InstagramPublishError(f"Graph API error on {path}: {body}")
    return body


def _publish_creation(creation_id: str, settings: Settings) -> str:
    result = _post(
        f"{settings.ig_business_account_id}/media_publish",
        settings,
        creation_id=creation_id,
    )
    return result["id"]


def publish_image(image_url: str, caption: str, settings: Settings) -> str:
    """Publishes a single feed image post. Returns the published media id."""
    created = _post(
        f"{settings.ig_business_account_id}/media",
        settings,
        image_url=image_url,
        caption=caption,
    )
    return _publish_creation(created["id"], settings)


def publish_reel(
    video_url: str,
    caption: str,
    settings: Settings,
    poll_interval_seconds: int = 10,
    timeout_seconds: int = 600,
) -> str:
    """Publishes a Reel from a hosted video URL. Returns the published media id.

    Video containers need server-side processing before they can be
    published, so this polls status_code until it reports FINISHED.
    """
    created = _post(
        f"{settings.ig_business_account_id}/media",
        settings,
        media_type="REELS",
        video_url=video_url,
        caption=caption,
    )
    creation_id = created["id"]

    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        status = _get(creation_id, settings, fields="status_code")
        code = status.get("status_code")
        if code == "FINISHED":
            return _publish_creation(creation_id, settings)
        if code == "ERROR":
            raise InstagramPublishError(f"Reel container {creation_id} failed processing: {status}")
        time.sleep(poll_interval_seconds)

    raise InstagramPublishError(f"Reel container {creation_id} did not finish processing within {timeout_seconds}s")
