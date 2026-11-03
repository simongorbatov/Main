#!/usr/bin/env python3
"""Pull everything due soon from Canvas and write it to a JSON file.

Reads:
  CANVAS_BASE_URL       e.g. https://bostoncollege.instructure.com  (no trailing slash)
  CANVAS_TOKEN          a personal access token (Canvas > Account > Settings > New Access Token)
  CANVAS_COURSE_FILTER  optional regex matched against course name/code, e.g. "BC|Business"
  BRIEF_DAYS_AHEAD      how many days ahead to look (default 7)

Writes <out>/canvas.json with courses, planner items, assignments, announcements,
module items, and every video URL found in any of them.
"""
import datetime as dt
import json
import os
import re
import sys
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

BASE = os.environ.get("CANVAS_BASE_URL", "").rstrip("/")
TOKEN = os.environ.get("CANVAS_TOKEN", "")
COURSE_FILTER = os.environ.get("CANVAS_COURSE_FILTER", "")
DAYS_AHEAD = int(os.environ.get("BRIEF_DAYS_AHEAD", "7"))

VIDEO_HOST_RE = re.compile(
    r"(youtube\.com|youtu\.be|vimeo\.com|panopto\.com|kaltura\.com|"
    r"instructuremedia\.com|instructure\.com/media_objects|zoom\.us/rec|"
    r"loom\.com|wistia\.com|echo360|mediaspace|\.mp4(\?|$)|\.m4v(\?|$)|\.mov(\?|$))",
    re.I,
)


def die(msg):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(2)


def session():
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {TOKEN}"
    return s


def get_all(s, path, **params):
    """Follow Canvas Link-header pagination."""
    url = path if path.startswith("http") else f"{BASE}/api/v1{path}"
    params.setdefault("per_page", 100)
    out = []
    while url:
        r = s.get(url, params=params, timeout=60)
        if r.status_code == 401:
            die("Canvas returned 401: CANVAS_TOKEN is missing, expired, or wrong.")
        r.raise_for_status()
        data = r.json()
        out.extend(data if isinstance(data, list) else [data])
        url = r.links.get("next", {}).get("url")
        params = {}
    return out


def html_to_text(html):
    if not html:
        return ""
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup.find_all(["br", "p", "div", "li", "tr", "h1", "h2", "h3", "h4"]):
        tag.append("\n")
    for a in soup.find_all("a", href=True):
        if a.get_text(strip=True) and a["href"].startswith("http"):
            a.append(f" ({a['href']})")
    text = soup.get_text(" ")
    text = "\n".join(re.sub(r"[ \t]+", " ", line).strip() for line in text.splitlines())
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def find_videos(html, base_url):
    """Return [{url, title}] for every video-looking link/iframe in an HTML blob."""
    if not html:
        return []
    soup = BeautifulSoup(html, "html.parser")
    found = []
    for tag in soup.find_all(["a", "iframe", "video", "source"]):
        url = tag.get("href") or tag.get("src") or ""
        if not url:
            continue
        url = urljoin(base_url, url)
        if VIDEO_HOST_RE.search(url):
            title = (tag.get("title") or tag.get_text(" ") or "").strip()[:120]
            found.append({"url": url, "title": title})
    # Bare URLs in text
    for m in re.finditer(r"https?://[^\s\"'<>]+", soup.get_text(" ")):
        if VIDEO_HOST_RE.search(m.group(0)):
            found.append({"url": m.group(0), "title": ""})
    seen, uniq = set(), []
    for v in found:
        if v["url"] not in seen:
            seen.add(v["url"])
            uniq.append(v)
    return uniq


def iso(d):
    return d.strftime("%Y-%m-%dT%H:%M:%SZ")


def main():
    if not BASE or not TOKEN:
        die("Set CANVAS_BASE_URL and CANVAS_TOKEN in the environment.")
    out_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    os.makedirs(out_dir, exist_ok=True)
    s = session()

    now = dt.datetime.now(dt.timezone.utc)
    horizon = now + dt.timedelta(days=DAYS_AHEAD)
    lookback = now - dt.timedelta(days=2)

    me = get_all(s, "/users/self")[0]
    courses = get_all(
        s, "/courses", enrollment_state="active", include=["term"], state=["available"]
    )
    if COURSE_FILTER:
        rx = re.compile(COURSE_FILTER, re.I)
        courses = [
            c for c in courses
            if rx.search(c.get("name") or "") or rx.search(c.get("course_code") or "")
        ]
    course_ids = {c["id"]: c for c in courses}
    print(f"User: {me.get('name')} | courses: {[c.get('course_code') for c in courses]}", file=sys.stderr)

    result = {
        "generated_at": iso(now),
        "horizon_days": DAYS_AHEAD,
        "user": {"name": me.get("name"), "id": me.get("id")},
        "courses": [
            {"id": c["id"], "name": c.get("name"), "code": c.get("course_code")} for c in courses
        ],
        "planner": [],
        "assignments": [],
        "announcements": [],
        "module_items": [],
        "videos": [],
    }
    videos = {}

    def add_videos(found, context):
        for v in found:
            entry = videos.setdefault(v["url"], {"url": v["url"], "title": v["title"], "contexts": []})
            if not entry["title"] and v["title"]:
                entry["title"] = v["title"]
            if context not in entry["contexts"]:
                entry["contexts"].append(context)

    # 1. Planner: the same list the Canvas "To Do" / dashboard uses (assignments, quizzes,
    #    discussions, calendar events, pages with to-do dates). Includes overdue-and-unsubmitted.
    try:
        planner = get_all(
            s, "/planner/items",
            start_date=iso(now - dt.timedelta(days=14)), end_date=iso(horizon),
            context_codes=[f"course_{cid}" for cid in course_ids],
        )
    except requests.HTTPError as e:
        print(f"planner fetch failed: {e}", file=sys.stderr)
        planner = []
    for p in planner:
        if p.get("course_id") not in course_ids:
            continue
        pl = p.get("plannable") or {}
        sub = p.get("submissions") or {}
        done = (sub.get("submitted") or sub.get("graded")) if isinstance(sub, dict) else False
        marked = (p.get("planner_override") or {}).get("marked_complete")
        result["planner"].append({
            "course": course_ids[p["course_id"]].get("course_code"),
            "type": p.get("plannable_type"),
            "title": pl.get("title") or pl.get("name"),
            "due_at": pl.get("due_at") or pl.get("todo_date") or p.get("plannable_date"),
            "points": pl.get("points_possible"),
            "submitted": bool(done),
            "marked_complete": bool(marked),
            "url": urljoin(BASE, p.get("html_url") or ""),
            "plannable_id": pl.get("id"),
        })

    # 2. Assignments with full descriptions, due in window (or overdue and unsubmitted).
    for cid, c in course_ids.items():
        try:
            assignments = get_all(
                s, f"/courses/{cid}/assignments", include=["submission"], order_by="due_at",
                bucket="unsubmitted",
            )
        except requests.HTTPError as e:
            print(f"assignments for {cid} failed: {e}", file=sys.stderr)
            continue
        for a in assignments:
            due = a.get("due_at")
            if due:
                due_dt = dt.datetime.fromisoformat(due.replace("Z", "+00:00"))
                if due_dt > horizon or due_dt < now - dt.timedelta(days=14):
                    continue
            desc_html = a.get("description") or ""
            ctx = f"{c.get('course_code')} / assignment: {a.get('name')}"
            add_videos(find_videos(desc_html, BASE), ctx)
            result["assignments"].append({
                "id": a.get("id"),
                "course": c.get("course_code"),
                "name": a.get("name"),
                "due_at": due,
                "points": a.get("points_possible"),
                "submission_types": a.get("submission_types"),
                "submitted": bool((a.get("submission") or {}).get("submitted_at")),
                "url": a.get("html_url"),
                "description": html_to_text(desc_html)[:4000],
            })

    # 3. Announcements from the last 2 days.
    try:
        anns = get_all(
            s, "/announcements",
            context_codes=[f"course_{cid}" for cid in course_ids],
            start_date=lookback.date().isoformat(), end_date=horizon.date().isoformat(),
        )
    except requests.HTTPError as e:
        print(f"announcements failed: {e}", file=sys.stderr)
        anns = []
    for an in anns:
        cid = int(str(an.get("context_code", "course_0")).split("_")[-1])
        c = course_ids.get(cid, {})
        msg_html = an.get("message") or ""
        ctx = f"{c.get('course_code')} / announcement: {an.get('title')}"
        add_videos(find_videos(msg_html, BASE), ctx)
        result["announcements"].append({
            "course": c.get("course_code"),
            "title": an.get("title"),
            "posted_at": an.get("posted_at"),
            "url": an.get("html_url"),
            "message": html_to_text(msg_html)[:3000],
        })

    # 4. Modules: items that are not yet completed. Fetch page bodies to find embedded videos.
    for cid, c in course_ids.items():
        try:
            modules = get_all(s, f"/courses/{cid}/modules", include=["items", "content_details"])
        except requests.HTTPError as e:
            print(f"modules for {cid} failed: {e}", file=sys.stderr)
            continue
        for m in modules:
            if m.get("state") == "locked":
                continue
            unlock = m.get("unlock_at")
            if unlock and dt.datetime.fromisoformat(unlock.replace("Z", "+00:00")) > horizon:
                continue
            for it in m.get("items") or []:
                req = it.get("completion_requirement") or {}
                if req.get("completed"):
                    continue
                itype = it.get("type")
                entry = {
                    "course": c.get("course_code"),
                    "module": m.get("name"),
                    "type": itype,
                    "title": it.get("title"),
                    "url": it.get("html_url"),
                    "external_url": it.get("external_url"),
                    "due_at": (it.get("content_details") or {}).get("due_at"),
                    "has_requirement": bool(req),
                }
                ctx = f"{c.get('course_code')} / module {m.get('name')} / {it.get('title')}"
                if it.get("external_url") and VIDEO_HOST_RE.search(it["external_url"]):
                    add_videos([{"url": it["external_url"], "title": it.get("title") or ""}], ctx)
                if itype == "Page" and it.get("page_url"):
                    try:
                        page = get_all(s, f"/courses/{cid}/pages/{it['page_url']}")[0]
                        body = page.get("body") or ""
                        add_videos(find_videos(body, BASE), ctx)
                        entry["page_text"] = html_to_text(body)[:2500]
                    except requests.HTTPError:
                        pass
                result["module_items"].append(entry)

    result["videos"] = list(videos.values())
    path = os.path.join(out_dir, "canvas.json")
    with open(path, "w") as f:
        json.dump(result, f, indent=2)
    print(
        f"wrote {path}: {len(result['planner'])} planner items, {len(result['assignments'])} assignments, "
        f"{len(result['announcements'])} announcements, {len(result['module_items'])} module items, "
        f"{len(result['videos'])} videos",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
