#!/usr/bin/env bash
# Markdown -> HTML (pandoc) -> PDF (Chromium via CDP), avajadi-formatted.
# The footer with page numbers, version, revision and the logo is set in print.js, not the CSS.
# Usage: build.sh <file.md> [file.md ...]
set -euo pipefail
TOOLS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# front_matter <key> <file>: the value of a top-level `key:` in a leading YAML block
# (first line `---`, up to the closing `---` or `...`), surrounding quotes stripped.
# Empty when there is no block or no such key.
front_matter() {
  awk -v key="$1" '
    NR==1 { if ($0 != "---") exit; next }
    $0 == "---" || $0 == "..." { exit }
    index($0, key ":") == 1 {
      sub("^" key ":[ \t]*", ""); gsub(/^["'"'"']|["'"'"']$/, ""); print; exit
    }' "$2"
}

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

  # A leading YAML block is pandoc metadata (gfm has yaml_metadata_block), so it never
  # renders; `version:` and `revision:` from it go into the footer next to the name.
  version="$(front_matter version "$md")"
  revision="$(front_matter revision "$md")"

  AVAJADI_MD2PDF_DOC_VERSION="$version" AVAJADI_MD2PDF_REVISION="$revision" \
    node --experimental-websocket --no-warnings "$TOOLS/print.js" "$html" "$pdf"

  rm -f "$html"
  printf '%-28s -> %s (%s, %s pages)\n' "$base.md" "$base.pdf" \
    "$(du -h "$pdf" | cut -f1)" "$(pdfinfo "$pdf" | awk '/^Pages/{print $2}')"
done
