from __future__ import annotations

import random
from dataclasses import dataclass

from .config import Settings
from .data_source import Card

_HYPE_HEADLINES = [
    "🔥 {name} just dropped",
    "Don't sleep on this one 👀",
    "New pickup alert 🚨",
    "Straight fire for your binder 🔥",
]
_MINIMAL_HEADLINES = [
    "{name}",
    "Now available",
    "Fresh listing",
]
_COLLECTOR_HEADLINES = [
    "For the serious collectors 📈",
    "Grail alert: {name}",
    "Add this to the PC 🗂️",
]

_HEADLINES_BY_TONE = {
    "hype": _HYPE_HEADLINES,
    "minimal": _MINIMAL_HEADLINES,
    "collector": _COLLECTOR_HEADLINES,
}


@dataclass
class AdCopy:
    headline: str
    caption: str
    cta: str
    hashtags: list[str]

    @property
    def full_caption(self) -> str:
        parts = [self.caption, self.cta]
        if self.hashtags:
            parts.append(" ".join(self.hashtags))
        return "\n\n".join(parts)


def _hashtags_for(card: Card, settings: Settings) -> list[str]:
    tags = list(settings.copy.get("extra_hashtags", []))
    if card.card_set:
        tags.append("#" + "".join(ch for ch in card.card_set if ch.isalnum()))
    if card.category:
        tags.append("#" + "".join(ch for ch in card.category if ch.isalnum()))
    if card.is_preorder:
        tags.append("#preorder")
    # de-dupe, keep order, cap at 12 (Instagram best-practice, not a hard limit)
    seen = set()
    deduped = []
    for t in tags:
        low = t.lower()
        if low not in seen and len(t) > 1:
            seen.add(low)
            deduped.append(t)
    return deduped[:12]


def generate_copy(card: Card, settings: Settings) -> AdCopy:
    tone = settings.copy.get("tone", "hype")
    headlines = _HEADLINES_BY_TONE.get(tone, _HYPE_HEADLINES)
    headline = random.choice(headlines).format(name=card.name)

    price_line = f"${card.display_price:.2f}"
    if card.on_sale:
        price_line = f"~${card.price:.2f}~ now ${card.sale_price:.2f}"

    details = [card.name]
    if card.card_set:
        details.append(card.card_set)
    if card.rarity:
        details.append(card.rarity)
    if card.condition:
        details.append(card.condition)

    caption_lines = [
        " | ".join(details),
        price_line,
    ]
    if card.is_preorder:
        caption_lines.append("Available for preorder now.")
    elif card.quantity_available <= 3:
        caption_lines.append(f"Only {card.quantity_available} left!")

    caption = "\n".join(caption_lines)
    cta = f"Claim it before it's gone -> link in bio ({settings.brand.get('website', '')})"

    return AdCopy(
        headline=headline,
        caption=caption,
        cta=cta,
        hashtags=_hashtags_for(card, settings) if settings.copy.get("include_hashtags", True) else [],
    )
