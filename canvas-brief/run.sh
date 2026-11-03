#!/usr/bin/env bash
# Pull Canvas, fetch video transcripts, and write brief_raw.md. Prints the output directory.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:-${TMPDIR:-/tmp}/canvas-brief-$(date +%Y-%m-%d)}"
mkdir -p "$OUT"
python3 -m pip install -q -r "$HERE/requirements.txt" >/dev/null
python3 -I "$HERE/fetch_canvas.py" "$OUT"
python3 -I "$HERE/get_transcripts.py" "$OUT"
python3 -I "$HERE/build_brief.py" "$OUT" >/dev/null
if [ -n "${NOTION_TOKEN:-}" ]; then python3 -I "$HERE/notion_sync.py" "$OUT"; else echo "NOTION_TOKEN not set: skipping Notion sync" >&2; fi
echo "$OUT"
