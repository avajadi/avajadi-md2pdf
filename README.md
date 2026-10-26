---
version: 1.0.0
---
# avajadi-md2pdf

Converts Markdown to a PDF in the avajadi graphical profile: A4 portrait, Space Grotesk
headings, IBM Plex Sans body text, JetBrains Mono for code, charcoal and cream from the
panda logo with bamboo green as the single accent, and a footer with page numbers, the
name, an optional version and revision, and the panda on every page.

Forked from `rise-md2pdf` (RISE's internal tool). The pipeline is the same; the
profile, fonts and logo are avajadi's, and the PowerPoint path is left out since it's
built on RISE's own template. See [example.md](example.md) and its PDF for every styled
element.

## Usage

### Docker (no local dependencies)

Install once by symlinking the wrapper onto your `PATH`:

```
ln -s "$(pwd)/md2pdf" ~/bin/md2pdf    # or ~/.local/bin, whichever is on PATH
```

Then, from any directory:

```
md2pdf <file.md> [file.md ...]     # -> file.pdf, next to each source file
md2pdf --help                      # usage, options and the image in use
md2pdf --version                   # wrapper version, plus the image's own if built
```

`--version` prints the version of the checkout the wrapper lives in (`version.txt`) and
the image reference it would run, with that image's own version label when it is
already built, so an image that wasn't rebuilt after a version bump shows up there. A
file name that starts with `-` can be passed after `--`.

There's no registry. The first run builds the image locally from this directory and
tags it `avajadi-md2pdf:latest`, labelled with the version from `version.txt`. After
changing CSS, fonts or scripts, rebuild it:

```
md2pdf --rebuild
```

Files can live anywhere on the filesystem: each file's directory is mounted into the
container at the same path, and the PDF is written back owned by you.
`AVAJADI_MD2PDF_IMAGE` overrides the image reference if you want to try a differently
tagged build.

If the RISE `md2pdf` is already on your `PATH` under that name, give this one another
name (e.g. `ln -s "$(pwd)/md2pdf" ~/bin/ava2pdf`). The wrapper finds its own repo
through the symlink, so the name doesn't matter.

### Local (needs pandoc, Chromium, Node.js 18+ and poppler-utils)

```
./build.sh <file.md> [file.md ...]
```

This is exactly what runs inside the image.

## A version and revision number in the footer

A document that starts with a YAML block carrying `version:` and/or `revision:` gets
them printed in the footer of every page, in that order, between the name and the
panda:

```
---
version: 1.2.0
revision: 8
---
# My document
```

The footer then reads `Version 1.2.0  Revision 8` on every page. Either key may be left
out, and the values are printed as written, so a date works as well as a number. Use
`version:` for the version of the thing the document describes, and bump `revision:`
with every change to the document itself that is handed out, so a reader can tell two
printouts apart. The block is pandoc metadata, so it does not show up in the document
body, and any other key in it is ignored. Without the block, or without either key, the
footer is as before.

This README carries `version:` itself, kept equal to `version.txt`, so `md2pdf README.md`
prints the tool version it documents. Update both when bumping.

## Design

| Property      | Value                                                              |
|---------------|--------------------------------------------------------------------|
| Page format   | A4 portrait; margins 22 mm top, 20 mm bottom and sides             |
| Body text     | IBM Plex Sans, 10 pt, line height 1.55, charcoal `#2D2D2D`         |
| H1            | Space Grotesk Bold, 2.15 rem, charcoal, 3 px bamboo `#3E7B27` rule |
| H2            | Space Grotesk Bold, 1.45 rem, charcoal                             |
| H3            | Space Grotesk Bold, 1.15 rem, bamboo                               |
| H6            | Uppercase, letterspaced, bamboo                                    |
| Code          | JetBrains Mono on cream `#F4F1E4`, bamboo left border              |
| Tables        | Charcoal header with cream text; alternating cream rows            |
| Links         | Bamboo, underlined (so they still read as links in grayscale)      |
| Blockquotes   | Pale bamboo `#EEF4E6` background, bamboo left border               |
| Footer        | `page/total` in JetBrains Mono, `AVAJADI SYSTEMS` letterspaced, optional version and revision, panda |

All colors live as tokens in `avajadi-tokens.css`. The footer can't see those tokens
(it renders in its own document), so `print.js` repeats charcoal and bamboo as
literals - change both places if you change either color.

## How it differs from rise-md2pdf internally

**One font path instead of two.** RISE embeds Code Pro as a data URI because its OS/2
`fsType` is 8, and Chromium's Skia rasterizes system fonts with a non-zero `fsType`
into Type 3 glyphs. Space Grotesk, IBM Plex Sans and JetBrains Mono all have `fsType`
0, so every font comes in through the `fonts.conf` that `print.js` writes at run time.
There's no `make-fonts.py` and no generated font CSS. If you swap in a new font, check
its `fsType` first:

```
python3 -c "from fontTools.ttLib import TTFont; print(TTFont('fonts/X.ttf')['OS/2'].fsType)"
```

**The logo is derived.** `assets/source/avajadi-systems-panda-logo.png` is charcoal on
an opaque cream background. `make-logo.py` knocks the cream out to transparency and
writes `assets/avajadi-logo.png` (full logo) and `assets/avajadi-mark.png` (panda head
only, used in the footer, since the logo's own lettering would be about 1 mm tall
there). Re-run it if the source logo changes. The source is only 97 × 121 px, which
holds up at footer size; a vector or larger original would be needed for anything
bigger, such as a cover page.

## Verifying a build

```
pdffonts file.pdf
```

Should list only `SpaceGrotesk-Bold`, `IBMPlexSans*` and `JetBrainsMono*`, all as
`CID TrueType`. `Type 3` means a font got rasterized (check its `fsType`); `DejaVuSans`
means the document uses a glyph these fonts lack, which is usually harmless.

```
pdftotext file.pdf - | grep -cE '^[0-9]+/[0-9]+$'
```

Should equal the page count from `pdfinfo file.pdf`. A lower count means the footer
lost its page number on some page, typically a footer font problem.

## Repo layout

| Path                 | Role                                                                  |
|----------------------|-----------------------------------------------------------------------|
| `md2pdf`             | Docker wrapper. Builds the image on first use; `--rebuild` rebuilds.  |
| `version.txt`        | The tool version. Labels the image; `--version` prints it. Bump it with the README's `version:`. |
| `build.sh`           | Markdown → HTML (pandoc) → PDF. The image's entrypoint. Also picks `version:` and `revision:` out of the YAML block for the footer. |
| `print.js`           | Drives Chromium over CDP; page size, margins and footer (including the version and revision). |
| `avajadi-doc.css`    | The document template: typography, tables, code, heading scale.       |
| `avajadi-tokens.css` | Color and font tokens.                                                |
| `make-logo.py`       | Derives the transparent logo and footer mark from `assets/source/`.   |
| `fonts/`             | Space Grotesk Bold, IBM Plex Sans (4 styles), JetBrains Mono (2).     |
| `assets/`            | Derived logos; `source/` holds the original.                          |
| `example.md`         | Exercises every styled element. Doubles as the smoke test.            |
| `Dockerfile`         | pandoc, Chromium and this repo's files, so nothing is needed locally. Takes `--build-arg VERSION`. |

## Licenses

Space Grotesk, IBM Plex Sans and JetBrains Mono are under the SIL Open Font License
1.1; the license texts are in `fonts/`. The panda logo is avajadi's own.
