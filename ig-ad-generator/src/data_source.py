from __future__ import annotations

from dataclasses import dataclass

import requests

from .config import Settings


@dataclass
class Card:
    id: str
    name: str
    card_set: str | None
    card_number: str | None
    rarity: str | None
    category: str | None
    condition: str | None
    price: float
    sale_price: float | None
    is_preorder: bool
    quantity_available: int
    photo_url: str | None
    photo_urls: list[str]
    created_at: str

    @property
    def hero_photo(self) -> str | None:
        if self.photo_url:
            return self.photo_url
        return self.photo_urls[0] if self.photo_urls else None

    @property
    def on_sale(self) -> bool:
        return self.sale_price is not None and self.sale_price < self.price

    @property
    def display_price(self) -> float:
        return self.sale_price if self.on_sale else self.price


def _row_to_card(row: dict) -> Card:
    return Card(
        id=row["id"],
        name=row["name"],
        card_set=row.get("card_set"),
        card_number=row.get("card_number"),
        rarity=row.get("rarity"),
        category=row.get("category"),
        condition=row.get("condition"),
        price=float(row["price"]),
        sale_price=float(row["sale_price"]) if row.get("sale_price") is not None else None,
        is_preorder=bool(row.get("is_preorder")),
        quantity_available=int(row.get("quantity_available", 0)),
        photo_url=row.get("photo_url"),
        photo_urls=row.get("photo_urls") or [],
        created_at=row.get("created_at", ""),
    )


def fetch_cards(settings: Settings) -> list[Card]:
    """Pull candidate cards from the public `cards` table via the Supabase REST API.

    Uses the same anon/public key the storefront uses client-side; the
    `cards` table has a public-read RLS policy, so this is a plain read.
    """
    sel = settings.selection
    params = {
        "select": "*",
        "order": "created_at.desc",
        "limit": str(max(sel.get("count", 3) * 5, 15)),  # overfetch, then filter/pick locally
    }

    if sel.get("only_in_stock", True):
        params["quantity_available"] = "gt.0"

    strategy = sel.get("strategy", "newest")
    if strategy == "preorder":
        params["is_preorder"] = "eq.true"

    resp = requests.get(
        f"{settings.supabase_url}/rest/v1/cards",
        headers={
            "apikey": settings.supabase_anon_key,
            "Authorization": f"Bearer {settings.supabase_anon_key}",
        },
        params=params,
        timeout=30,
    )
    resp.raise_for_status()
    cards = [_row_to_card(row) for row in resp.json()]

    if strategy == "on_sale":
        cards = [c for c in cards if c.on_sale]
    elif strategy == "random":
        import random

        random.shuffle(cards)

    return cards[: sel.get("count", 3)]
