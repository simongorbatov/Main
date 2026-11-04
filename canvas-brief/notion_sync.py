#!/usr/bin/env python3
"""Upsert Canvas to-do items into the Notion "Canvas Tasks" database (School page).

Reads:
  NOTION_TOKEN          internal integration token (https://www.notion.so/profile/integrations)
  NOTION_TASKS_DS       data source id of Canvas Tasks (default: the one under the School page)
  BRIEF_TZ              timezone for due dates (default America/Los_Angeles)

Usage:
  notion_sync.py <out_dir>                      sync canvas.json -> Notion rows
  notion_sync.py --note <canvas_id> <text>      append text to one row's Notes (video summary)
Writes <out_dir>/notion_rows.json mapping canvas_id -> notion page url.
"""
import datetime as dt
import json
import os
import re
import sys
from zoneinfo import ZoneInfo

import requests

TOKEN = os.environ.get("NOTION_TOKEN", "")
DS = os.environ.get("NOTION_TASKS_DS", "9022dec9-e1ea-4808-8d9c-20f13a582f48")
API = os.environ.get("NOTION_API", "https://api.notion.com/v1")
TZ = ZoneInfo(os.environ.get("BRIEF_TZ", "America/Los_Angeles"))
HEADERS = {"Authorization": f"Bearer {TOKEN}", "Notion-Version": "2025-09-03", "Content-Type": "application/json"}


def die(msg):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(2)


def call(method, path, **body):
    r = requests.request(method, f"{API}{path}", headers=HEADERS, json=body or None, timeout=60)
    if r.status_code == 401:
        die("Notion returned 401: NOTION_TOKEN is missing or wrong.")
    if r.status_code == 404:
        die("Notion returned 404: share the School page with the integration (page ••• > Connections).")
    if not r.ok:
        die(f"Notion {method} {path} -> {r.status_code}: {r.text[:300]}")
    return r.json()


def rich(text):
    return {"rich_text": [{"text": {"content": (text or "")[:1900]}}]}


def find_row(canvas_id):
    res = call("POST", f"/data_sources/{DS}/query",
               filter={"property": "Canvas ID", "rich_text": {"equals": canvas_id}}, page_size=1)
    return res["results"][0] if res.get("results") else None


def props_for(item):
    due = item.get("due_at")
    p = {
        "Task": {"title": [{"text": {"content": item["title"][:200]}}]},
        "Type": {"select": {"name": item.get("type") or "Other"}},
        "Course": rich(item.get("course")),
        "Canvas ID": rich(item["canvas_id"]),
        "Done": {"checkbox": bool(item.get("done"))},
    }
    if item.get("url"):
        p["Link"] = {"url": item["url"]}
    if item.get("points") is not None:
        p["Points"] = {"number": float(item["points"])}
    if due:
        local = dt.datetime.fromisoformat(due.replace("Z", "+00:00")).astimezone(TZ)
        p["Due"] = {"date": {"start": local.isoformat(timespec="minutes")}}
    return p


TYPE_MAP = {"assignment": "Assignment", "quiz": "Quiz", "discussion_topic": "Discussion", "wiki_page": "Reading",
            "Page": "Reading", "File": "Reading", "ExternalUrl": "Other", "ExternalTool": "Other"}


def type_for(raw, title=""):
    if raw in TYPE_MAP:
        return TYPE_MAP[raw]
    return "Video" if re.search(r"video|watch|lecture|recording", title or "", re.I) else "Other"


def items_from(data):
    """Turn canvas.json into one row per thing to do, keyed by a stable Canvas id."""
    out = {}
    for p in data.get("planner", []):
        cid = f"{p['type']}:{p.get('plannable_id')}"
        out[cid] = {"canvas_id": cid, "title": p["title"] or "(untitled)", "course": p["course"],
                    "due_at": p.get("due_at"), "points": p.get("points"), "url": p.get("url"),
                    "done": p["submitted"] or p["marked_complete"], "type": type_for(p["type"], p["title"])}
    # Assignments carry instructions the planner lacks; merge notes in, add any the planner missed.
    for a in data.get("assignments", []):
        match = out.get(f"assignment:{a.get('id')}") or next((v for v in out.values() if v["url"] == a["url"]), None)
        if match is None:
            cid = f"assignment-url:{a['url']}"
            match = out[cid] = {"canvas_id": cid, "title": a["name"], "course": a["course"], "due_at": a["due_at"],
                                "points": a["points"], "url": a["url"], "done": a["submitted"], "type": "Assignment"}
        match["instructions"] = (a.get("description") or "")[:600]
    for m in data.get("module_items", []):
        if not m.get("has_requirement") or m["type"] in ("Assignment", "Quiz", "Discussion"):
            continue  # graded things already come through the planner
        cid = f"module:{m.get('url') or m.get('external_url')}"
        out[cid] = {"canvas_id": cid, "title": m["title"], "course": m["course"],
                    "due_at": m.get("due_at"), "points": None, "url": m.get("url") or m.get("external_url"),
                    "done": False, "type": type_for(m["type"], m["title"])}
    return list(out.values())


def sync(out_dir):
    data = json.load(open(os.path.join(out_dir, "canvas.json")))
    mapping, created, updated = {}, 0, 0
    for item in items_from(data):
        row = find_row(item["canvas_id"])
        props = props_for(item)
        if row is None:
            if item.get("instructions"):
                props["Notes"] = rich(item["instructions"])
            row = call("POST", "/pages", parent={"type": "data_source_id", "data_source_id": DS}, properties=props)
            created += 1
        else:
            # Never flip a row back to not-done if the user ticked it by hand; never clobber Notes.
            if row["properties"].get("Done", {}).get("checkbox"):
                props.pop("Done", None)
            call("PATCH", f"/pages/{row['id']}", properties=props)
            updated += 1
        mapping[item["canvas_id"]] = {"url": row.get("url"), "page_id": row["id"], "title": item["title"]}
    json.dump(mapping, open(os.path.join(out_dir, "notion_rows.json"), "w"), indent=2)
    print(f"notion: {created} rows created, {updated} updated", file=sys.stderr)


def add_note(canvas_id, text):
    row = find_row(canvas_id)
    if row is None:
        die(f"no Notion row with Canvas ID {canvas_id}")
    existing = "".join(t.get("plain_text", "") for t in row["properties"].get("Notes", {}).get("rich_text", []))
    joined = (existing + "\n\n" + text).strip() if existing else text
    call("PATCH", f"/pages/{row['id']}", properties={"Notes": rich(joined)})
    print(row.get("url"))


if __name__ == "__main__":
    if not TOKEN:
        die("Set NOTION_TOKEN in the environment.")
    if len(sys.argv) >= 4 and sys.argv[1] == "--note":
        add_note(sys.argv[2], sys.argv[3])
    else:
        sync(sys.argv[1] if len(sys.argv) > 1 else ".")
