from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent


def _load_yaml(path: Path) -> dict:
    with open(path, "r") as f:
        return yaml.safe_load(f)


@dataclass
class Settings:
    raw: dict
    supabase_url: str
    supabase_anon_key: str
    supabase_bucket: str
    ig_access_token: str
    ig_business_account_id: str

    @property
    def brand(self) -> dict:
        return self.raw["brand"]

    @property
    def selection(self) -> dict:
        return self.raw["selection"]

    @property
    def copy(self) -> dict:
        return self.raw["copy"]

    @property
    def image(self) -> dict:
        return self.raw["image"]

    @property
    def video(self) -> dict:
        return self.raw["video"]

    @property
    def publish(self) -> dict:
        return self.raw["publish"]


def load_settings(config_path: str | Path = ROOT / "config.yaml") -> Settings:
    raw = _load_yaml(Path(config_path))

    def env(name: str, required: bool = False) -> str:
        val = os.environ.get(name, "")
        if required and not val:
            raise RuntimeError(
                f"Missing required environment variable {name}. "
                f"Copy .env.example to .env (or set it as a GitHub Actions secret) and fill it in."
            )
        return val

    return Settings(
        raw=raw,
        supabase_url=env("SUPABASE_URL", required=True).rstrip("/"),
        supabase_anon_key=env("SUPABASE_ANON_KEY", required=True),
        supabase_bucket=env("SUPABASE_STORAGE_BUCKET") or "ig-ad-assets",
        ig_access_token=env("IG_ACCESS_TOKEN"),
        ig_business_account_id=env("IG_BUSINESS_ACCOUNT_ID"),
    )
