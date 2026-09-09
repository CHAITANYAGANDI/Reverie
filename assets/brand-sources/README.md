# Brand assets

**This directory holds only what the browser loads.** The approved source
artwork lives outside the Next app:

| file | where | what it is |
| --- | --- | --- |
| `reverie-main.png` | `assets/brand-sources/` | **approved source.** The product lockup. 1254x1254. Never edited. |
| `reverie-ai-orb.png` | `assets/brand-sources/` | **approved source.** The AI orb. 1254x1254. Never edited. |
| `reverie-main-hero.webp` | `frontend/public/brand/` | derived. The landing hero's identity. 820x576, 152 kB. |
| `reverie-ai-orb-mark.webp` | `frontend/public/brand/` | derived. Every Reverie AI placement. 256x256, 55 kB. |

The sources were here first, and `public/` is Next's static directory: every
file in it is copied into the deployment and served at its own URL. Nothing in
production loads the two PNGs — the browser gets the WebPs — so keeping them
here shipped 2.6 MB of source art and published it at a guessable path. They
stay in the repository because they *are* the approval; they are simply not part
of the build's output. `/brand/reverie-main.png` now 404s, which is the point.

Lossless WebP, meant literally: the alpha channel is identical to the PNG the
script builds, and the RGB is bit-identical at every pixel where alpha is
non-zero. The two differ only in the colour stored *behind* fully transparent
pixels, which nothing can observe. Worth checking rather than assuming —
`lossless=True` is one keyword away from a quality-75 re-encode of approved
artwork.

The two derived files are produced by `frontend/scripts/extract-brand-assets.py`.
Run it from `frontend/` after replacing either source — it reads
`../assets/brand-sources/` and writes here:

```
python scripts/extract-brand-assets.py
```

## Why the sources are not loaded directly

Three reasons, all properties of the files:

1. **No alpha.** Both are PNG colour-type 2 — truecolour, no alpha channel — so
   each carries a baked dark-navy background. Placed on a page they paint a
   1254px opaque square: a dark box around a 30px button glyph, and a rectangle
   behind the hero whose corners are a different navy from the page's canvas.
2. **The mark is a minority of the frame.** The orb occupies about 43% of its
   image's width and sits above centre, with a separate reflection blob below
   it — an `<img width=30>` of the source renders a 13px orb in a 30px box. The
   lockup occupies about 61% of its frame and has the landing page's horizon arc
   baked into the bottom third.
3. **1.2 MB each.**

The script crops the approved pixels and turns the baked background into
transparency. It invents nothing: every RGB value in the output comes from the
source, and the composite over the app's canvas is within 4/255 per channel of
the original across the lit mark. See the module docstring for how the alpha is
built and why the colour is unpremultiplied.

## The two identities

| identity | component | means |
| --- | --- | --- |
| Reverie | `components/v2/brand-mark.tsx` | which product am I using |
| Reverie AI | `components/v2/reverie-ai-mark.tsx` | where is Reverie's assistant |

They are never interchanged. The AI orb goes on the seven surfaces that invoke
the assistant and nowhere else — the list is at the foot of
`reverie-ai-mark.tsx`.

## Vector and raster, and where the line is

The **AI orb is the raster everywhere**, 18px to 56px. That was tested rather
than assumed: both the artwork and a vector reconstruction were rasterised at
every production size through a canvas and magnified with nearest-neighbour, and
the artwork held its structure to 24px and its character to 16 while the vector
read flat. The vector — `ai-mark-geometry.ts`, three optical cuts, a bar table —
was deleted rather than kept as a fallback nothing reached.

The **Reverie mark stays vector** in the band's corner, the nav lockup, the auth
shell and the footer. At 27-42px those want vector edges and no 600 kB file, and
`BrandMark`'s `crop` makes the element the drawing. The **landing hero uses the
raster**, because at 555px the render's depth is the whole difference between a
logo and a lockup.

## Serving

Both derived files are referenced by path from `public/`, so Next serves them
with `Cache-Control: public, max-age=0` — a conditional request per navigation
rather than a re-download. A plain `<img>` rather than `next/image`: the
optimiser re-encodes, and these assets' exact pixels are what was approved.

## Naming

`reverie-<what>.png`, lowercase, no version suffixes. Not
`logo-final-v2-new3.png`.
