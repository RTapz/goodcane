"""Makes the flavour bottle images (spec 6.4) from one licensed photo.

Run once, by hand, when the photo or a flavour colour changes:
    python scripts/assets/make_bottles.py

Needs Python 3 with Pillow and numpy (not part of the app). Writes small transparent WebP files
to public/bottles/: <flavour>-sm.webp for cards and rows, <flavour>-lg.webp for the C1 hero.

How it works:
1. Cut-out: the photo is a glass bottle of juice lying among sliced fruit of almost the same colour,
   so colour cannot separate them. The outline is traced by hand instead: the bottle is upright and
   symmetric, so it is a list of (row, half-width) points around a centre column, measured on the
   photo. The edge is drawn at 4x and scaled down so it is smooth.
2. Recolour: the juice takes the flavour colour's hue, and its saturation and brightness are scaled
   so its typical pixel matches the flavour colour; the photo's own light and shade stay. The white
   cap and the pale glass highlights keep their own (greyed) colour, so every flavour still reads
   as juice in a glass bottle.
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "scripts" / "assets" / "bottle-source.jpg"
OUT = ROOT / "public" / "bottles"

# Same colours as app/utils/flavour-colours.ts.
FLAVOURS = {
    "Raw cane": "#7A9A3A",
    "Lemon-mint cane": "#2E8B4A",
    "Ginger-lemon cane": "#C8643B",
    "Tigernut-coconut cane": "#8C8C8C",
    "Passionfruit cane": "#5B3A9B",
    "Lemon-charcoal cane": "#3A3F44",
    "Cucumber cane": "#3C9E92",
    "Passionlemon cane": "#B9861A",
}
SIZES = {"sm": 240, "lg": 720}  # output heights in pixels (about 2.5x the largest display size)
ASPECT = 0.37  # output width / height; app/components/FlavourBottle.vue uses the same number

# The traced outline (pixels in the 1333x2000 source): centre column, then (row, half-width) from
# the top of the cap to the bottom of the glass base. Rows in between are interpolated.
CENTRE = 667.5
OUTLINE = [
    (352, 80), (356, 115), (362, 138), (372, 154), (385, 163), (398, 166), (455, 166),  # cap (domed top)
    (458, 148), (560, 149),  # neck
    (620, 159), (670, 174), (720, 189), (770, 201), (820, 210), (900, 226), (1000, 233),  # shoulder
    (1600, 235), (1630, 218), (1645, 195), (1658, 160), (1662, 100),  # body and base
]
CAP_BOTTOM = 457


def slug(name: str) -> str:
    return name.lower().replace(" ", "-")


def hex_to_rgb(value: str) -> np.ndarray:
    value = value.lstrip("#")
    return np.array([int(value[i : i + 2], 16) for i in (0, 2, 4)], dtype=np.float64) / 255.0


def rgb_to_hsv(rgb: np.ndarray) -> np.ndarray:
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    v = rgb.max(axis=-1)
    c = v - rgb.min(axis=-1)
    s = np.where(v > 0, c / np.maximum(v, 1e-9), 0)
    h = np.zeros_like(v)
    safe = np.maximum(c, 1e-9)
    h = np.where(v == r, ((g - b) / safe) % 6, h)
    h = np.where(v == g, (b - r) / safe + 2, h)
    h = np.where(v == b, (r - g) / safe + 4, h)
    h = np.where(c == 0, 0, h) / 6.0
    return np.stack([h, s, v], axis=-1)


def hsv_to_rgb(hsv: np.ndarray) -> np.ndarray:
    h, s, v = hsv[..., 0] * 6.0, hsv[..., 1], hsv[..., 2]
    i = np.floor(h).astype(int) % 6
    f = h - np.floor(h)
    p, q, t = v * (1 - s), v * (1 - s * f), v * (1 - s * (1 - f))
    choices = [
        np.stack([v, t, p], -1),
        np.stack([q, v, p], -1),
        np.stack([p, v, t], -1),
        np.stack([p, q, v], -1),
        np.stack([t, p, v], -1),
        np.stack([v, p, q], -1),
    ]
    out = np.zeros(hsv.shape)
    for k in range(6):
        out = np.where((i == k)[..., None], choices[k], out)
    return out


def outline_alpha(width: int, height: int) -> np.ndarray:
    """The traced outline as a soft-edged alpha mask, drawn at 4x and scaled down."""
    scale = 4
    rows = np.arange(OUTLINE[0][0], OUTLINE[-1][0] + 1)
    half = np.interp(rows, [p[0] for p in OUTLINE], [p[1] for p in OUTLINE])
    left = [((CENTRE - h) * scale, y * scale) for y, h in zip(rows, half)]
    right = [((CENTRE + h) * scale, y * scale) for y, h in zip(rows, half)]
    big = Image.new("L", (width * scale, height * scale), 0)
    ImageDraw.Draw(big).polygon(left + right[::-1], fill=255)
    small = big.resize((width, height), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.6))
    return np.asarray(small, dtype=np.float64) / 255.0


def main() -> None:
    source = Image.open(SOURCE).convert("RGB")
    photo = np.asarray(source, dtype=np.float64) / 255.0
    alpha = outline_alpha(source.width, source.height)

    ys, xs = np.where(alpha > 0.02)
    pad = 6
    top, bottom = max(ys.min() - pad, 0), min(ys.max() + pad, photo.shape[0] - 1)
    left, right = max(xs.min() - pad, 0), min(xs.max() + pad, photo.shape[1] - 1)
    photo, alpha = photo[top : bottom + 1, left : right + 1], alpha[top : bottom + 1, left : right + 1]
    hsv = rgb_to_hsv(photo)
    rows = np.arange(hsv.shape[0])[:, None] + top

    # The juice: well inside the outline, below the cap, clearly coloured.
    juice = (alpha > 0.95) & (rows > CAP_BOTTOM + 10) & (hsv[..., 1] > 0.6)
    juice_s, juice_v = np.median(hsv[..., 1][juice]), np.median(hsv[..., 2][juice])

    # What keeps its own (greyed) colour: the cap, and the pale glass highlights on the body.
    cap = np.broadcast_to(rows <= CAP_BOTTOM, alpha.shape)  # its shaded side reflects the fruit, so all of it
    highlight = np.clip((0.55 - hsv[..., 1]) / 0.35, 0, 1) * (hsv[..., 2] > 0.7)
    keep = np.maximum(cap.astype(np.float64), highlight)
    grey = np.repeat(hsv[..., 2:3] * 0.97, 3, axis=-1)

    OUT.mkdir(parents=True, exist_ok=True)
    for name, colour in FLAVOURS.items():
        target = rgb_to_hsv(hex_to_rgb(colour)[None, None, :])[0, 0]
        new = hsv.copy()
        new[..., 0] = target[0]
        new[..., 1] = np.clip(hsv[..., 1] * target[1] / juice_s, 0, 1)
        new[..., 2] = np.clip(hsv[..., 2] * target[2] / juice_v, 0, 1)
        rgb = hsv_to_rgb(new) * (1 - keep[..., None]) + grey * keep[..., None]
        image = Image.fromarray((np.dstack([rgb, alpha]) * 255).round().astype(np.uint8), "RGBA")
        for size, height in SIZES.items():
            width = round(height * ASPECT)
            fit = image.resize((round(image.width * height / image.height), height), Image.LANCZOS)
            canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
            canvas.paste(fit, ((width - fit.width) // 2, 0))
            path = OUT / f"{slug(name)}-{size}.webp"
            canvas.save(path, "WEBP", quality=80, method=6)
            print(f"{path.relative_to(ROOT)}  {width}x{height}  {path.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
