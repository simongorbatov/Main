#!/usr/bin/env python3
"""Merge canvas.json + transcripts.json into one markdown file Claude reads to write the brief."""
import datetime as dt
import json
import os
import sys
from zoneinfo import ZoneInfo

TZ = ZoneInfo(os.environ.get("BRIEF_TZ", "America/Los_Angeles"))


def local(ts):
    if not ts:
        return "no date"
    d = dt.datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone(TZ)
    return d.strftime("%a %b %d, %I:%M %p")


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    data = json.load(open(os.path.join(out_dir, "canvas.json")))
    tpath = os.path.join(out_dir, "transcripts.json")
    transcripts = json.load(open(tpath)) if os.path.exists(tpath) else {}
    now = dt.datetime.now(TZ)
    L = [f"# Raw Canvas pull for {now.strftime('%A %b %d, %Y')} (generated {now.strftime('%I:%M %p %Z')})",
         "", f"Courses: {', '.join(c['code'] or c['name'] for c in data['courses'])}", ""]

    L += ["## Planner (what Canvas itself lists as to-do, next %d days + anything overdue)" % data["horizon_days"], ""]
    items = sorted(data["planner"], key=lambda p: p.get("due_at") or "9999")
    for p in items:
        flag = "DONE" if p["submitted"] or p["marked_complete"] else "TODO"
        pts = f", {p['points']} pts" if p.get("points") else ""
        L.append(f"- [{flag}] {p['course']} | {p['type']} | {p['title']} | due {local(p['due_at'])}{pts} | {p['url']}")
    if not items:
        L.append("- (nothing in planner)")

    L += ["", "## Assignments not yet submitted (with instructions)", ""]
    for a in sorted(data["assignments"], key=lambda a: a.get("due_at") or "9999"):
        L += [f"### {a['course']}: {a['name']}",
              f"Due {local(a['due_at'])} | {a['points']} pts | types: {', '.join(a['submission_types'] or [])} | {a['url']}", ""]
        if a["description"]:
            L += [a["description"], ""]
    if not data["assignments"]:
        L.append("- (none)")

    L += ["", "## Announcements (last 2 days)", ""]
    for an in data["announcements"]:
        L += [f"### {an['course']}: {an['title']} ({local(an['posted_at'])})", an["message"] or "", ""]
    if not data["announcements"]:
        L.append("- (none)")

    L += ["", "## Incomplete module items", ""]
    for m in data["module_items"]:
        due = f" | due {local(m['due_at'])}" if m.get("due_at") else ""
        L.append(f"- {m['course']} | {m['module']} | {m['type']} | {m['title']}{due} | {m['url'] or m.get('external_url') or ''}")
        if m.get("page_text"):
            L.append("  > " + m["page_text"][:600].replace("\n", " "))
    if not data["module_items"]:
        L.append("- (none)")

    L += ["", "## Videos found", ""]
    for v in data["videos"]:
        t = transcripts.get(v["url"], {})
        L += [f"### {v['title'] or v['url']}", f"URL: {v['url']}", f"Where: {'; '.join(v['contexts'])}"]
        if t.get("status") == "ok":
            L += [f"Transcript ({t['method']}{', truncated' if t.get('truncated') else ''}):", "", t["text"], ""]
        else:
            L += [f"Transcript NOT available: {t.get('error', 'not attempted')}", ""]
    if not data["videos"]:
        L.append("- (no videos linked in anything above)")

    path = os.path.join(out_dir, "brief_raw.md")
    open(path, "w").write("\n".join(L) + "\n")
    print(path)


if __name__ == "__main__":
    main()
