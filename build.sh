#!/usr/bin/env bash
# Markdown -> HTML (pandoc) -> PDF (Chromium via CDP), avajadi-formatted.
# The footer with page numbers and the logo is set in print.js, not the CSS.
# Usage: build.sh <file.md> [file.md ...]
set -euo pipefail
TOOLS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

for md in "$@"; do
  [ -f "$md" ] || { echo "missing: $md" >&2; exit 1; }
  dir="$(cd "$(dirname "$md")" && pwd)"
  base="$(basename "$md" .md)"
  html="$dir/$base.html"
  pdf="$dir/$base.pdf"

  # definition_lists isn't part of gfm but is useful in documents; the rest of
  # the gfm extensions (tables, footnotes, task lists, strikethrough) are already in.
  pandoc "$md" \
    --from=gfm+definition_lists --to=html5 --standalone \
    --variable pagetitle="$base" \
    --css="file://$TOOLS/avajadi-doc.css" \
    --output="$html"

  node --experimental-websocket --no-warnings "$TOOLS/print.js" "$html" "$pdf"

  rm -f "$html"
  printf '%-28s -> %s (%s, %s pages)\n' "$base.md" "$base.pdf" \
    "$(du -h "$pdf" | cut -f1)" "$(pdfinfo "$pdf" | awk '/^Pages/{print $2}')"
done
