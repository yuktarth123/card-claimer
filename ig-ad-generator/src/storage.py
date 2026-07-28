from __future__ import annotations

import mimetypes
from pathlib import Path

import requests

from .config import Settings


def upload_file(settings: Settings, local_path: Path, remote_path: str) -> str:
    """Uploads a file to the Supabase Storage bucket and returns its public URL.

    Instagram's Graph API requires media to be referenced by a publicly
    reachable URL (it fetches it server-side), so generated images/videos
    are staged here before being handed to the publish step. Requires the
    bucket to be public with an INSERT policy for the anon role -- see
    SETUP.md for the SQL to create it.
    """
    content_type = mimetypes.guess_type(str(local_path))[0] or "application/octet-stream"
    url = f"{settings.supabase_url}/storage/v1/object/{settings.supabase_bucket}/{remote_path}"

    with open(local_path, "rb") as f:
        resp = requests.post(
            url,
            headers={
                "apikey": settings.supabase_anon_key,
                "Authorization": f"Bearer {settings.supabase_anon_key}",
                "Content-Type": content_type,
                "x-upsert": "true",
            },
            data=f,
            timeout=120,
        )
    if not resp.ok:
        raise RuntimeError(f"Supabase storage upload failed ({resp.status_code}): {resp.text}")

    return f"{settings.supabase_url}/storage/v1/object/public/{settings.supabase_bucket}/{remote_path}"
