"""Makes the flavour bottle images (spec 6.4) from one licensed photo.

Run once, by hand, when the photo or a flavour colour changes:
    python scripts/assets/make_bottles.py

Needs Python 3 with Pillow and numpy (not part of the app). Writes small transparent WebP files
to public/bottles/: <flavour>-sm.webp for cards and rows, <flavour>-lg.webp for the C1 hero.

How it works:
1. Cut-out: the bottle is the coloured and darker part of the photo; the background is near-white
   and grey-neutral. The largest connected shape is kept and its edge softened.
2. Recolour: the photo's shading is smoothed (so JPEG grain is not amplified), a gentle cylinder
   shading and soft highlight are added so the bottle reads as round, and each pixel takes the
   flavour colour's hue and saturation with the flavour colour as its mid-tone. The dark neck ring
   keeps its own colour.
"""

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

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


def largest_component(mask: np.ndarray) -> np.ndarray:
    """The biggest 4-connected True region (the bottle), found on a 1/4 size copy for speed."""
    small = mask[::4, ::4]
    seen = np.zeros_like(small, dtype=bool)
    best: list[tuple[int, int]] = []
    rows, cols = small.shape
    for y in range(rows):
        for x in range(cols):
            if small[y, x] and not seen[y, x]:
                region, queue = [], deque([(y, x)])
                seen[y, x] = True
                while queue:
                    cy, cx = queue.popleft()
                    region.append((cy, cx))
                    for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                        if 0 <= ny < rows and 0 <= nx < cols and small[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            queue.append((ny, nx))
                if len(region) > len(best):
                    best = region
    keep_small = np.zeros_like(small, dtype=bool)
    for y, x in best:
        keep_small[y, x] = True
    keep = np.repeat(np.repeat(keep_small, 4, axis=0), 4, axis=1)[: mask.shape[0], : mask.shape[1]]
    return keep & mask


def main() -> None:
    photo = np.asarray(Image.open(SOURCE).convert("RGB"), dtype=np.float64) / 255.0
    hsv = rgb_to_hsv(photo)
    # Bottle: clearly coloured, or dark (the neck ring). Background: bright and nearly grey.
    mask = (hsv[..., 1] > 0.18) | (hsv[..., 2] < 0.45)
    mask = largest_component(mask)
    # Fill pinholes, then soften the edge by one or two pixels so it does not look cut with scissors.
    alpha_img = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    alpha_img = alpha_img.filter(ImageFilter.GaussianBlur(1.2))
    alpha = np.asarray(alpha_img, dtype=np.float64) / 255.0

    ys, xs = np.where(alpha > 0.02)
    pad = 12
    top, bottom = max(ys.min() - pad, 0), min(ys.max() + pad, photo.shape[0] - 1)
    left, right = max(xs.min() - pad, 0), min(xs.max() + pad, photo.shape[1] - 1)
    photo, hsv, alpha = photo[top : bottom + 1, left : right + 1], hsv[top : bottom + 1, left : right + 1], alpha[top : bottom + 1, left : right + 1]

    body = (alpha > 0.9) & (hsv[..., 1] > 0.18)
    body_v = np.median(hsv[..., 2][body])

    # The neck ring: neutral and dark, only in the top fifth (so shadowed edges are not mistaken for it).
    rows = np.arange(hsv.shape[0])[:, None]
    ring = (hsv[..., 1] <= 0.18) & (hsv[..., 2] < 0.35) & (rows < hsv.shape[0] * 0.2)

    # Smoothed shading and saturation: keeps the soft light of the photo, drops the grain.
    def smooth(channel: np.ndarray, radius: float) -> np.ndarray:
        img = Image.fromarray((np.clip(channel, 0, 1) * 255).round().astype(np.uint8), "L")
        return np.asarray(img.filter(ImageFilter.GaussianBlur(radius)), dtype=np.float64) / 255

    shade_v = smooth(hsv[..., 2], 16)

    # Cylinder shading: per row, u runs from -1 (left edge) to 1 (right edge) of the bottle.
    # Edges are measured per row, then smoothed down the bottle so the shading does not ripple.
    height = alpha.shape[0]
    lefts, rights = np.full(height, np.nan), np.full(height, np.nan)
    for y in range(height):
        xs_row = np.where(alpha[y] > 0.5)[0]
        if len(xs_row) > 2:
            lefts[y], rights[y] = xs_row[0], xs_row[-1]
    window = 41
    def running_median(values: np.ndarray) -> np.ndarray:
        out = values.copy()
        for y in range(height):
            chunk = values[max(0, y - window // 2) : y + window // 2 + 1]
            chunk = chunk[~np.isnan(chunk)]
            if len(chunk):
                out[y] = np.median(chunk)
        return out
    lefts, rights = running_median(lefts), running_median(rights)
    u = np.zeros(alpha.shape)
    for y in range(height):
        if not np.isnan(lefts[y]):
            mid, half = (lefts[y] + rights[y]) / 2, max((rights[y] - lefts[y]) / 2, 1)
            u[y] = (np.arange(alpha.shape[1]) - mid) / half
    u = np.clip(u, -1, 1)
    form = 0.74 + 0.32 * np.cos(u * np.pi / 2) ** 0.7 + 0.06 * np.exp(-(((u + 0.38) / 0.22) ** 2))

    OUT.mkdir(parents=True, exist_ok=True)
    for name, colour in FLAVOURS.items():
        target = rgb_to_hsv(hex_to_rgb(colour)[None, None, :])[0, 0]
        new = hsv.copy()
        new[..., 0] = target[0]
        new[..., 1] = target[1]  # one even saturation: the photo's blotchy patches are not carried over
        # The flavour colour is the mid-tone; the smoothed photo shading and the cylinder form vary it.
        new[..., 2] = np.clip(target[2] * np.clip(shade_v / body_v, 0.9, 1.1) * form, 0, 1)
        rgb = hsv_to_rgb(new)
        rgb = np.where(ring[..., None], photo, rgb)
        rgba = np.dstack([rgb, alpha])
        image = Image.fromarray((rgba * 255).round().astype(np.uint8), "RGBA")
        for size, height in SIZES.items():
            width = round(image.width * height / image.height)
            resized = image.resize((width, height), Image.LANCZOS)
            path = OUT / f"{slug(name)}-{size}.webp"
            resized.save(path, "WEBP", quality=84, method=6)
            print(f"{path.relative_to(ROOT)}  {width}x{height}  {path.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
