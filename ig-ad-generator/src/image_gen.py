from __future__ import annotations

import io
import re
import urllib.parse
from pathlib import Path

import requests
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from .config import ROOT, Settings
from .copywriter import AdCopy
from .data_source import Card

POLLINATIONS_BASE = "https://image.pollinations.ai/prompt"

# The bundled DejaVu font can't render emoji (shows as tofu boxes), so strip
# them from text baked into the image. The real IG caption (posted as text,
# not pixels) keeps emoji via AdCopy.full_caption.
_EMOJI_RE = re.compile(
    "["
    "\U0001f300-\U0001faff"  # symbols & pictographs, emoticons, transport, supplemental
    "\U00002600-\U000027bf"  # misc symbols & dingbats
    "\U0001f1e6-\U0001f1ff"  # regional indicators (flag emoji)
    "\U00002b00-\U00002bff"  # arrows / misc symbols
    "\U0000fe0f"  # variation selector-16
    "]+",
    flags=re.UNICODE,
)


def _clean_overlay_text(text: str) -> str:
    return _EMOJI_RE.sub("", text).strip()


def _wrap_text(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    words = text.split()
    if not words:
        return []
    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        trial = f"{current} {word}"
        bbox = draw.textbbox((0, 0), trial, font=font)
        if bbox[2] - bbox[0] <= max_width:
            current = trial
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


def _fit_font_and_wrap(
    draw: ImageDraw.ImageDraw, text: str, base_size: int, max_width: int, max_lines: int
) -> tuple[ImageFont.FreeTypeFont, list[str]]:
    size = base_size
    while size > 12:
        font = _font(size)
        lines = _wrap_text(draw, text, font, max_width)
        if len(lines) <= max_lines:
            return font, lines
        size -= 4
    return _font(size), _wrap_text(draw, text, _font(size), max_width)


def _font(size: int) -> ImageFont.FreeTypeFont:
    """Best-effort font loader.

    Drop a .ttf into assets/fonts/brand.ttf for on-brand text; otherwise
    falls back to a bundled DejaVu font (ships with Pillow) so this always
    works with zero setup.
    """
    custom = ROOT / "assets" / "fonts" / "brand.ttf"
    if custom.exists():
        return ImageFont.truetype(str(custom), size)
    try:
        return ImageFont.truetype("DejaVuSans-Bold.ttf", size)
    except OSError:
        return ImageFont.load_default()


def fetch_background(prompt: str, width: int, height: int, timeout: int = 60) -> Image.Image:
    """Free, no-signup AI image generation via Pollinations.ai."""
    encoded = urllib.parse.quote(prompt)
    url = f"{POLLINATIONS_BASE}/{encoded}"
    resp = requests.get(
        url,
        params={"width": width, "height": height, "nologo": "true"},
        timeout=timeout,
    )
    resp.raise_for_status()
    return Image.open(io.BytesIO(resp.content)).convert("RGB")


def fetch_card_photo(url: str, timeout: int = 30) -> Image.Image:
    resp = requests.get(url, timeout=timeout)
    resp.raise_for_status()
    return Image.open(io.BytesIO(resp.content)).convert("RGBA")


def _fit_cover(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Resize+crop img to exactly fill size, like CSS background-size: cover."""
    target_w, target_h = size
    src_w, src_h = img.size
    scale = max(target_w / src_w, target_h / src_h)
    new_size = (max(1, round(src_w * scale)), max(1, round(src_h * scale)))
    resized = img.resize(new_size, Image.LANCZOS)
    left = (resized.width - target_w) // 2
    top = (resized.height - target_h) // 2
    return resized.crop((left, top, left + target_w, top + target_h))


def _hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    hex_color = hex_color.lstrip("#")
    return tuple(int(hex_color[i : i + 2], 16) for i in (0, 2, 4))


def compose_ad_image(
    card: Card,
    copy: AdCopy,
    background: Image.Image,
    card_photo: Image.Image | None,
    settings: Settings,
    size: tuple[int, int],
) -> Image.Image:
    canvas = _fit_cover(background, size).convert("RGBA")
    # darken the bottom third so text stays legible over any background
    gradient = Image.new("L", (1, size[1]), 0)
    for y in range(size[1]):
        gradient.putpixel((0, y), int(180 * max(0, (y - size[1] * 0.55) / (size[1] * 0.45))))
    shade = Image.new("RGBA", size, (0, 0, 0, 255))
    shade.putalpha(gradient.resize(size))
    canvas = Image.alpha_composite(canvas, shade)

    if card_photo is not None:
        max_w = int(size[0] * 0.72)
        max_h = int(size[1] * 0.5)
        photo = card_photo.copy()
        photo.thumbnail((max_w, max_h), Image.LANCZOS)
        # soft drop shadow
        shadow = Image.new("RGBA", (photo.width + 40, photo.height + 40), (0, 0, 0, 0))
        shadow_draw = ImageDraw.Draw(shadow)
        shadow_draw.rounded_rectangle(
            [20, 24, 20 + photo.width, 24 + photo.height], radius=18, fill=(0, 0, 0, 140)
        )
        shadow = shadow.filter(ImageFilter.GaussianBlur(14))
        shadow_pos = ((size[0] - shadow.width) // 2, int(size[1] * 0.10))
        canvas.alpha_composite(shadow, shadow_pos)
        photo_pos = (shadow_pos[0] + 20, shadow_pos[1] + 20)
        canvas.alpha_composite(photo, photo_pos)

    draw = ImageDraw.Draw(canvas)
    accent = _hex_to_rgb(settings.brand.get("accent_color", "#1d4ed8"))
    margin = int(size[0] * 0.06)

    # price badge, top-right
    price_text = f"${card.display_price:.2f}"
    if card.on_sale:
        price_text = f"SALE ${card.sale_price:.2f}"
    badge_font = _font(int(size[0] * 0.06))
    text_bbox = draw.textbbox((0, 0), price_text, font=badge_font)
    pad = 18
    badge_w = (text_bbox[2] - text_bbox[0]) + pad * 2
    badge_h = (text_bbox[3] - text_bbox[1]) + pad * 2
    badge_pos = (size[0] - margin - badge_w, margin)
    draw.rounded_rectangle(
        [badge_pos[0], badge_pos[1], badge_pos[0] + badge_w, badge_pos[1] + badge_h],
        radius=14,
        fill=(*accent, 235),
    )
    draw.text(
        (badge_pos[0] + pad, badge_pos[1] + pad - text_bbox[1]),
        price_text,
        font=badge_font,
        fill=(255, 255, 255, 255),
    )

    # headline + caption, bottom (wrapped and font-shrunk to fit within the canvas)
    text_max_width = size[0] - margin * 2
    body_font_size = int(size[0] * 0.04)
    body_font = _font(body_font_size)

    wrapped_caption_lines: list[str] = []
    for raw_line in copy.caption.split("\n"):
        wrapped_caption_lines.extend(_wrap_text(draw, _clean_overlay_text(raw_line), body_font, text_max_width))

    headline_font, headline_lines = _fit_font_and_wrap(
        draw, _clean_overlay_text(copy.headline), int(size[0] * 0.08), text_max_width, max_lines=2
    )

    y = size[1] - margin
    for line in reversed(wrapped_caption_lines):
        bbox = draw.textbbox((0, 0), line, font=body_font)
        y -= (bbox[3] - bbox[1]) + 10
        draw.text((margin, y), line, font=body_font, fill=(230, 230, 230, 255))
    y -= 14
    for line in reversed(headline_lines):
        bbox = draw.textbbox((0, 0), line, font=headline_font)
        y -= (bbox[3] - bbox[1]) + 6
        draw.text((margin, y), line, font=headline_font, fill=(255, 255, 255, 255))

    logo_path = ROOT / settings.brand.get("logo_path", "")
    if settings.brand.get("logo_path") and logo_path.exists():
        logo = Image.open(logo_path).convert("RGBA")
        logo.thumbnail((int(size[0] * 0.22), int(size[0] * 0.22)), Image.LANCZOS)
        canvas.alpha_composite(logo, (margin, margin))

    return canvas.convert("RGB")


def build_ad_images(card: Card, copy: AdCopy, settings: Settings, out_dir: Path) -> dict[str, Path]:
    """Generates the AI background once, then composites feed + story crops."""
    prompt = (
        f"{card.name}, {card.card_set or ''} trading card, "
        f"{settings.image.get('background_prompt_style', '')}"
    ).strip()

    feed_size = tuple(settings.image.get("feed_size", [1080, 1080]))
    story_size = tuple(settings.image.get("story_size", [1080, 1920]))
    biggest = (max(feed_size[0], story_size[0]), max(feed_size[1], story_size[1]))

    background = fetch_background(prompt, *biggest)
    card_photo = fetch_card_photo(card.hero_photo) if card.hero_photo else None

    out_dir.mkdir(parents=True, exist_ok=True)
    outputs = {}
    for label, size in (("feed", feed_size), ("story", story_size)):
        img = compose_ad_image(card, copy, background, card_photo, settings, size)
        path = out_dir / f"{card.id}_{label}.jpg"
        img.save(path, quality=92)
        outputs[label] = path
    return outputs
