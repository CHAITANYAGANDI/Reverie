"""
DERIVE THE SHIPPABLE BRAND ASSETS FROM THE APPROVED ARTWORK.

Run from `frontend/`:

    python scripts/extract-brand-assets.py

Reads the two approved sources, which are the visual source of truth and are
never edited:

    ../assets/brand-sources/reverie-main.png     1254x1254  the product lockup
    ../assets/brand-sources/reverie-ai-orb.png   1254x1254  the AI orb

OUTSIDE `frontend/public`, DELIBERATELY. They were there first, and `public/` is
Next's static directory: every file in it is copied into the deployment and
served at its own URL. Nothing in production loads these two — the browser gets
the derived WebPs below — so keeping them there shipped 2.6 MB of source art and
published it at a guessable path. They stay in the repository because they are
the approval; they are simply not part of the build's output.

Writes the two the product actually loads:

    public/brand/reverie-main-hero.webp    the lockup, cropped, with alpha
    public/brand/reverie-ai-orb-mark.webp  the orb, cropped square, with alpha

LOSSLESS WEBP, NOT PNG, and "lossless" is meant literally: the alpha channel is
identical and the RGB is bit-identical at every pixel where alpha is non-zero.
The two files differ only in the colour stored *behind* fully transparent
pixels, which nothing can observe. It is worth checking rather than assuming —
`Image.save(..., lossless=True)` is one keyword away from a quality-75 re-encode
of the approved artwork. Measured: 306 kB against 656 for the lockup, 66 against
93 for the orb.

WHY THIS SCRIPT EXISTS AT ALL
=============================

The approved files cannot be used as-is, for three reasons that are properties
of the files rather than opinions about them:

1.  THEY HAVE NO ALPHA. Both are PNG colour-type 2 — truecolour, no alpha
    channel — so each carries a baked dark-navy background. Placed on a page
    they paint a 1254px opaque square. Around a 30px button glyph that is a
    visible dark box; behind the hero it is a rectangle whose corners are a
    different navy from the page's canvas. (And they are not in `public/`, so
    they could not be loaded by URL even if they were usable.)

2.  THE MARK IS A MINORITY OF THE FRAME. The orb occupies about 43% of its
    image's width and sits above centre, with a separate reflection blob below
    it. An `<img width=30>` of the raw file would render a 13px orb inside a
    30px box. The lockup occupies about 61% of its frame and has the landing
    page's horizon arc baked into the bottom third.

3.  1.2 MB EACH. For a mark drawn at 30px on every page of the application.

So this crops the approved pixels to what the mark actually is, and turns the
baked background into transparency. It invents nothing: every RGB value in the
output comes from the source. That distinction matters — this is the
"transparent extraction" the brief asks for, not a redraw.

HOW THE ALPHA IS BUILT
======================

The artwork is light emitted on a dark ground: `pixel = glow + background`. So
the background is ESTIMATED AND SUBTRACTED, and what is left is the glow, whose
own brightness is the matte.

That is the third attempt and the first correct one, and the two failures are
worth recording because both looked fine in the numbers:

1.  A LUMA THRESHOLD WITH A LOW FLOOR (4). The background is not flat — it is a
    navy gradient, near-black at the corners and reaching luma ~20 in the middle
    of the frame — so a low floor kept most of it at 5-20% alpha. Unpremultiplied,
    a veil at 8% alpha is a *bright* colour at 8% alpha, and the composite came
    out slightly lighter than the page around it: a visible rectangle exactly the
    size of the crop, sitting behind the hero. The fidelity numbers averaged it
    away; the rendered page did not.

2.  THE SAME THRESHOLD WITH A HIGH FLOOR (20), to clear that gradient. It
    cleared it, and took the lens's bloom with it — the glow lives at luma 20-60,
    which is precisely what was being discarded. The mark came out hard-edged and
    mottled where the light used to fade.

Subtraction has neither problem: the background goes to exactly zero everywhere,
including the bright middle of the frame, and every level of real glow survives.

The estimate is a block minimum, eroded and smoothed. Over a 24px grid the
darkest pixel in each block is background by definition unless the block is
entirely inside a bright shape — so the field is then eroded across a 3x3
neighbourhood of blocks, which handles strokes up to about 72px, and the
wordmark's are 40. Smoothed and resampled back up, it is a low-frequency field
that follows the artwork's own gradient.

Then the colour is UNPREMULTIPLIED, so that compositing reproduces the source:

    out * a + canvas * (1 - a)  ==  glow + canvas * (1 - a)  ~=  glow + background

because the page's canvas and the artwork's background are within a few levels
of each other. And alpha is floored at `max(r,g,b)/255`, because straight alpha
stores colour and coverage separately: if `glow / alpha` exceeds 255 it has to
be clipped, which throws away exactly the light the division was recovering.
Blue clips first here, the artwork being blue.

The orb additionally gets alpha forced to 1 inside its sphere, feathered over
`SPHERE_FEATHER` pixels at the edge. The sphere's dark conversational channel is
genuinely dark — near-black by design — and a brightness matte would make it
transparent, so the page would show through the middle of the mark and the
channel would take on the colour of whatever it sat on. On the Ask controls that
is a hover tint, so the orb's centre would appear to light up on hover. Inside
the sphere the artwork is opaque, so that is what is written.
"""

from __future__ import annotations

import numpy as np
from PIL import Image, ImageFilter

# Relative to `frontend/`, which is where this is run from — see the module
# docstring. The sources sit outside the Next app so they are never served.
SRC = "../assets/brand-sources"
OUT = "public/brand"

# Rec.709. The artwork is blue, and a flat average would under-weight the
# cyan highlights that carry most of the mark's structure.
LUMA = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)

# The alpha ramp, in luma of the background-subtracted glow.
#
# FLOOR started at 3 — enough to clear the source's compression noise, the
# background being gone by this point — and went to 11 for a reason only the
# rendered page shows. The artwork has a wide, very faint field behind the
# tagline, and reproducing it faithfully is not the same as it looking right:
# in the source that field sits inside a broader navy gradient and reads as
# atmosphere, while on the page it terminates where the artwork's own light
# stops and reads as a lighter strip about 540x26 behind the words. 11 drops it
# and keeps everything brighter, which is every part of the mark — the lens's
# own bloom is well above 40.
#
# CEIL is where the glow is dense enough to be fully opaque.
FLOOR = 11.0
CEIL = 70.0

# The background estimate: the darkest pixel in each 24px block, eroded across a
# 3x3 neighbourhood of blocks and smoothed. 24 is a quarter of the wordmark's
# stroke width, so no block sits entirely inside a letter; the erosion covers
# anything up to about 72px if one did.
BG_BLOCK = 24
BG_ERODE = 3
BG_SMOOTH = 1.6

# --------------------------------------------------------------- the crops
#
# Both were measured rather than eyeballed — see the bounds each one cites.

# The lockup: lens, wordmark, tagline. Lit content sits in rows 292..815 and,
# in the central columns, x 248..999 (the lockup is symmetric about x=623.5), so
# this leaves about 32px of margin all round for `EDGE_FEATHER` to ramp through.
# The horizon arc is excluded deliberately: it is the landing page's own
# atmosphere and is drawn there in CSS, where it can be tuned. The arc's first
# lit row is 883 at x=1010 and about 871 at x=1034, so a crop ending at row 834
# clears it entirely.
HERO_CROP = (214, 258, 214 + 820, 258 + 576)

# The orb: its sphere measures 540px across, centred at (626, 518). The crop is
# 648 square — exactly 1.2x the sphere — which is the same ratio the vector mark
# used, so `size` keeps meaning "the painted sphere" at every call site and no
# call site has to change. Every edge of this crop is at luma <= 27, and the
# reflection blob below the orb only becomes significant at y >= 864.
ORB_SPHERE = (626.0, 518.0, 270.0)
ORB_CROP = (302, 194, 302 + 648, 194 + 648)

# What the product loads. The orb is downsampled because nothing draws it above
# 56px, and 256 is 4x that; the lockup is kept at its native crop resolution,
# which is the most the source has.
ORB_OUT = 256
HERO_OUT = None

SPHERE_FEATHER = 3.0

# How far in from the crop's border alpha is ramped to zero.
#
# WITHOUT THIS THERE IS A VISIBLE RECTANGLE. The crop's edge cuts through live
# glow — faintly, but the artwork's field does not stop where the crop does — so
# alpha steps from whatever the glow implies straight to nothing at the border,
# and that step is a straight line four times over. It showed most clearly under
# the tagline, where the source has a wide faint band: a lighter box about
# 560x36 sitting behind the words. Seen in the rendered landing page.
#
# The crops are sized to make room for it: the lockup keeps ~32px of margin
# around its content and the orb ~54px, so a 26px ramp touches only background
# and the outermost bloom.
EDGE_FEATHER = 26.0


def luma_of(rgb: np.ndarray) -> np.ndarray:
    return rgb @ LUMA


# Below this, alpha is snapped to zero. Without it the unpremultiply divides
# near-zero alpha into the background's own compression noise and turns it into
# visible blue speckle across the corners of the frame — clearly there in the
# first extraction, at about 3% alpha, which is invisible as light and very
# visible as noise.
CUTOFF = 0.06


def background(rgb: np.ndarray) -> np.ndarray:
    """
    The artwork's own dark ground, as a smooth low-frequency field.

    <p>A block minimum, because the darkest pixel in a 24px block is background
    unless the whole block is inside a bright shape. Then eroded across
    neighbouring blocks so that a block which *is* fully inside a stroke takes a
    darker neighbour's value, then blurred and resampled up.
    """
    h, w, _ = rgb.shape
    ph, pw = (-h) % BG_BLOCK, (-w) % BG_BLOCK
    pad = np.pad(rgb, ((0, ph), (0, pw), (0, 0)), mode="edge")
    hh, ww, _ = pad.shape
    blocks = pad.reshape(hh // BG_BLOCK, BG_BLOCK, ww // BG_BLOCK, BG_BLOCK, 3).min(
        axis=(1, 3)
    )
    # Erode: each block takes the minimum over its BG_ERODE x BG_ERODE window.
    r = BG_ERODE // 2
    eroded = blocks.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            eroded = np.minimum(eroded, np.roll(np.roll(blocks, dy, 0), dx, 1))
    small = Image.fromarray(eroded.round().astype(np.uint8), "RGB").filter(
        ImageFilter.GaussianBlur(BG_SMOOTH)
    )
    up = np.asarray(small.resize((ww, hh), Image.BICUBIC)).astype(np.float32)
    return up[:h, :w]


def matte(glow: np.ndarray) -> np.ndarray:
    """Alpha from the glow's brightness, as a 0..1 float plane."""
    a = np.clip((luma_of(glow) - FLOOR) / (CEIL - FLOOR), 0.0, 1.0)
    return np.where(a < CUTOFF, 0.0, a)


def floor_alpha(source: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """
    Raise alpha to whatever the brightest channel needs, wherever the matte
    keeps the pixel at all.

    <p>THE PART THAT IS EASY TO MISS. Straight alpha stores colour and coverage
    separately, so `rgb = pixel / alpha` — and if that exceeds 255 the value has
    to be clipped, which throws away exactly the light the division was trying
    to recover. Blue clips first here, because the artwork is blue: a mid-tone
    band at 31% alpha wanted an rgb of 420 and got 255, so the composite came
    out darker than the source. Measured at a mean of 9.6/255 across the lit
    mark, with a 99th percentile of 72.
    
    <p>So alpha is at least `max(r,g,b)/255` of the *source* pixel — the value
    the output has to be able to represent once the ground is added back — which
    is the smallest coverage that avoids clipping. Only where the matte already
    decided the pixel is part of the mark; otherwise this would put the
    background back, at the 7% alpha its own faint blue implies.
    """
    need = source.max(axis=2) / 255.0
    return np.where(alpha > 0.0, np.maximum(alpha, need), 0.0)


def unpremultiply(
    glow: np.ndarray, ground: np.ndarray, alpha: np.ndarray
) -> np.ndarray:
    """
    Recover the emitted colour, so compositing reproduces the source.

    <h2>Why the ground is added back</h2>
    
    <p>What has to hold is `out * a + page * (1 - a) == glow + ground`, which is
    the source pixel. Solving it with `page ~= ground` — the assumption this
    whole extraction rests on, and accurate to a few levels — gives
    `out = glow / a + ground`.
    
    <p>Dropping the `+ ground` looks harmless and is not. It is exact only where
    alpha comes from the glow; wherever alpha is *raised* above what the glow
    implies it is wrong, and it is raised in the one place it matters most —
    inside the orb's sphere, which is forced opaque so the page cannot show
    through the mark's dark centre. At alpha 1 with no ground the composite is
    the glow alone, so the sphere came out 29/255 too dark on average and 135
    at the worst pixel. With the ground back, alpha 1 gives exactly the source.

    <p>Guarded against the near-zero alpha at the frame's edges, where the
    division would otherwise amplify the source's own compression noise into
    visible speckle.
    """
    safe = np.maximum(alpha, CUTOFF)[:, :, None]
    return np.clip(glow / safe + ground, 0.0, 255.0)


def extract(name: str, crop: tuple[int, int, int, int], out: int | None,
            sphere: tuple[float, float, float] | None = None) -> str:
    src = Image.open(f"{SRC}/{name}.png").convert("RGB")
    rgb = np.asarray(src.crop(crop)).astype(np.float32)
    # The light, with the ground taken out from under it.
    ground = background(rgb)
    glow = np.clip(rgb - ground, 0.0, 255.0)
    alpha = floor_alpha(rgb, matte(glow))

    # To zero at the border, so the crop has no edge of its own.
    yy, xx = np.mgrid[0 : rgb.shape[0], 0 : rgb.shape[1]].astype(np.float32)
    edge = np.minimum.reduce([xx, yy, rgb.shape[1] - 1 - xx, rgb.shape[0] - 1 - yy])
    alpha = alpha * np.clip(edge / EDGE_FEATHER, 0.0, 1.0)
    alpha = np.where(alpha < CUTOFF, 0.0, alpha)

    if sphere is not None:
        cx, cy, r = sphere
        cx -= crop[0]
        cy -= crop[1]
        dist = np.hypot(xx - cx, yy - cy)
        inside = np.clip((r - dist) / SPHERE_FEATHER + 1.0, 0.0, 1.0)
        alpha = np.maximum(alpha, inside)

    straight = unpremultiply(glow, ground, alpha)
    rgba = np.dstack([straight, alpha * 255.0]).round().astype(np.uint8)
    im = Image.fromarray(rgba, "RGBA")
    if out is not None:
        # LANCZOS on straight alpha bleeds transparent black into the edges, so
        # the resize is done premultiplied and undone after — the same reason
        # the unpremultiply above exists.
        im = premultiplied_resize(im, out)

    dest = (
        f"{OUT}/"
        + name.replace("reverie-main", "reverie-main-hero").replace(
            "reverie-ai-orb", "reverie-ai-orb-mark"
        )
        + ".webp"
    )
    # `method=6` is the slowest and smallest of webp's encoder efforts, which
    # for a file written once and served for ever is the right end to be at.
    im.save(dest, "WEBP", lossless=True, quality=100, method=6)
    return dest


def premultiplied_resize(im: Image.Image, side: int) -> Image.Image:
    a = np.asarray(im).astype(np.float32)
    alpha = a[:, :, 3:4] / 255.0
    pre = np.dstack([a[:, :, :3] * alpha, a[:, :, 3]]).round().astype(np.uint8)
    small = np.asarray(
        Image.fromarray(pre, "RGBA").resize((side, side), Image.LANCZOS)
    ).astype(np.float32)
    sa = np.maximum(small[:, :, 3:4] / 255.0, 1e-3)
    back = np.dstack([np.clip(small[:, :, :3] / sa, 0, 255), small[:, :, 3]])
    return Image.fromarray(back.round().astype(np.uint8), "RGBA")


if __name__ == "__main__":
    for name, crop, out, sphere in [
        ("reverie-main", HERO_CROP, HERO_OUT, None),
        ("reverie-ai-orb", ORB_CROP, ORB_OUT, ORB_SPHERE),
    ]:
        dest = extract(name, crop, out, sphere)
        w, h = Image.open(dest).size
        import os

        print(f"  {dest}  {w}x{h}  {os.path.getsize(dest) / 1024:.0f} kB")
