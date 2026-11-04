#!/usr/bin/env python3
"""Post a markdown brief as a new page under School / 📚 Canvas Briefs in Notion.

  notion_brief.py <brief.md> [title]
Reads NOTION_TOKEN and NOTION_BRIEFS_PAGE (default: School / Canvas Briefs). Prints the page URL.
Supports headings (#, ##, ###), bullets (-, *), numbered lists, bold **x**, and plain paragraphs.
"""
import datetime as dt
import os
import re
import sys
from zoneinfo import ZoneInfo

import requests

TOKEN = os.environ.get("NOTION_TOKEN", "")
PARENT = os.environ.get("NOTION_BRIEFS_PAGE", "40dc2493-65ba-81a3-b418-f15e93566cca")
API = os.environ.get("NOTION_API", "https://api.notion.com/v1")
HEADERS = {"Authorization": f"Bearer {TOKEN}", "Notion-Version": "2025-09-03", "Content-Type": "application/json"}


def rich_text(line):
    """Split **bold** and [text](url) into Notion rich text runs."""
    runs = []
    for part in re.split(r"(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))", line):
        if not part:
            continue
        m = re.fullmatch(r"\[([^\]]+)\]\(([^)]+)\)", part)
        if part.startswith("**") and part.endswith("**"):
            runs.append({"text": {"content": part[2:-2]}, "annotations": {"bold": True}})
        elif m:
            runs.append({"text": {"content": m.group(1), "link": {"url": m.group(2)}}})
        else:
            runs.append({"text": {"content": part}})
    # Notion caps a single text run at 2000 chars.
    out = []
    for r in runs:
        c = r["text"]["content"]
        for i in range(0, max(len(c), 1), 1900):
            out.append({**r, "text": {**r["text"], "content": c[i:i + 1900]}})
    return out


def blocks_from_markdown(md):
    blocks = []
    for raw in md.splitlines():
        line = raw.rstrip()
        if not line.strip():
            continue
        if line.startswith("### "):
            blocks.append({"type": "heading_3", "heading_3": {"rich_text": rich_text(line[4:])}})
        elif line.startswith("## "):
            blocks.append({"type": "heading_2", "heading_2": {"rich_text": rich_text(line[3:])}})
        elif line.startswith("# "):
            blocks.append({"type": "heading_1", "heading_1": {"rich_text": rich_text(line[2:])}})
        elif re.match(r"^\s*[-*] ", line):
            blocks.append({"type": "bulleted_list_item", "bulleted_list_item": {"rich_text": rich_text(re.sub(r"^\s*[-*] ", "", line))}})
        elif re.match(r"^\s*\d+[.)] ", line):
            blocks.append({"type": "numbered_list_item", "numbered_list_item": {"rich_text": rich_text(re.sub(r"^\s*\d+[.)] ", "", line))}})
        elif line.strip() == "---":
            blocks.append({"type": "divider", "divider": {}})
        else:
            blocks.append({"type": "paragraph", "paragraph": {"rich_text": rich_text(line.strip())}})
    return blocks


def main():
    if not TOKEN:
        print("ERROR: Set NOTION_TOKEN in the environment.", file=sys.stderr)
        sys.exit(2)
    md = open(sys.argv[1]).read()
    today = dt.datetime.now(ZoneInfo(os.environ.get("BRIEF_TZ", "America/Los_Angeles")))
    title = sys.argv[2] if len(sys.argv) > 2 else f"Brief {today.strftime('%a %b %d, %Y')}"
    blocks = blocks_from_markdown(md)
    body = {"parent": {"page_id": PARENT}, "icon": {"emoji": "📚"},
            "properties": {"title": {"title": [{"text": {"content": title}}]}}, "children": blocks[:100]}
    r = requests.post(f"{API}/pages", headers=HEADERS, json=body, timeout=60)
    if not r.ok:
        print(f"ERROR: Notion {r.status_code}: {r.text[:300]}", file=sys.stderr)
        sys.exit(2)
    page = r.json()
    for i in range(100, len(blocks), 100):  # Notion accepts 100 blocks per call
        rr = requests.patch(f"{API}/blocks/{page['id']}/children", headers=HEADERS,
                            json={"children": blocks[i:i + 100]}, timeout=60)
        rr.raise_for_status()
    print(page["url"])


if __name__ == "__main__":
    main()
