#!/usr/bin/env python3
# Derives the print logos from the source logo in assets/source/.
#
# The source is charcoal on an opaque cream background, which would show up as a
# cream box on white paper. Alpha is rebuilt from luminance instead: cream becomes
# fully transparent, charcoal fully opaque, and the anti-aliased edges in between keep
# their softness. Every pixel is then painted pure charcoal, so no cream fringe is left.
#
# Writes two files:
#   assets/avajadi-logo.png  the full logo, panda plus "AVAJADI SYSTEMS"
#   assets/avajadi-mark.png  the panda head only, for the footer, where the name is
#                            set as text instead (the logo's lettering would be ~1 mm tall)
#
# Usage: ./make-logo.py   (needs Pillow; re-run if the source logo is replaced)
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "assets" / "source" / "avajadi-systems-panda-logo.png"

CHARCOAL = (0x2D, 0x2D, 0x2D)
CREAM_LUMA = 252     # luminance of the source background, #FFFDF1
CHARCOAL_LUMA = 45   # luminance of the source ink, #2D2D2D


def knock_out(img):
    luma = img.convert("L")
    out = Image.new("RGBA", img.size)
    span = CREAM_LUMA - CHARCOAL_LUMA
    out.putdata([
        CHARCOAL + (max(0, min(255, round((CREAM_LUMA - v) * 255 / span))),)
        for v in luma.getdata()
    ])
    return out


def mark_rows(img):
    """Rows of the panda head: from the top down to the first fully empty row gap
    that separates it from the lettering."""
    w, h = img.size
    alpha = img.getchannel("A")
    inked = [any(alpha.getpixel((x, y)) > 64 for x in range(w)) for y in range(h)]
    top = inked.index(True)
    bottom = top
    while bottom < h and inked[bottom]:
        bottom += 1
    return top, bottom


def main():
    logo = knock_out(Image.open(SOURCE).convert("RGB"))
    logo.crop(logo.getbbox()).save(HERE / "assets" / "avajadi-logo.png")

    top, bottom = mark_rows(logo)
    head = logo.crop((0, top, logo.width, bottom))
    head.crop(head.getbbox()).save(HERE / "assets" / "avajadi-mark.png")


if __name__ == "__main__":
    main()
