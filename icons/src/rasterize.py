"""Rasterize SwiftConvert logo PNGs from the same geometry as icons/src/logo.svg."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def draw_logo(size: int) -> Image.Image:
    scale = size / 128
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rounded tile with vertical-ish gradient
    radius = max(2, int(28 * scale))
    # Paint gradient by rows inside rounded rect mask
    base = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    base_draw = ImageDraw.Draw(base)
    top = (27, 77, 74)
    mid = (20, 107, 99)
    bot = (14, 61, 58)
    for y in range(size):
        t = y / max(1, size - 1)
        if t < 0.55:
            c = lerp(top, mid, t / 0.55)
        else:
            c = lerp(mid, bot, (t - 0.55) / 0.45)
        base_draw.line([(0, y), (size, y)], fill=c + (255,))

    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [int(8 * scale), int(8 * scale), size - 1 - int(8 * scale), size - 1 - int(8 * scale)],
        radius=radius,
        fill=255,
    )
    tile = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    tile.paste(base, (0, 0), mask)
    img = Image.alpha_composite(img, tile)
    draw = ImageDraw.Draw(img)

    def poly(points, fill):
        pts = [(x * scale, y * scale) for x, y in points]
        draw.polygon(pts, fill=fill)

    # Upper chevron (mint)
    poly([(38, 44), (64, 30), (90, 44), (90, 56), (64, 42), (38, 56)], (232, 247, 244, 242))
    # Lower chevron (warm sand)
    poly([(38, 72), (64, 58), (90, 72), (90, 84), (64, 70), (38, 84)], (244, 194, 122, 250))

    # Connecting bar
    y = int(62 * scale)
    x0, x1 = int(54 * scale), int(74 * scale)
    stroke = max(1, int(5 * scale))
    draw.line([(x0, y), (x1, y)], fill=(232, 247, 244, 140), width=stroke)

    return img


def main():
    for size in (16, 32, 48, 128):
        path = OUT / f"icon{size}.png"
        draw_logo(size).save(path, "PNG")
        print("wrote", path)


if __name__ == "__main__":
    main()
