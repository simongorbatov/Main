# Canvas morning brief

A scheduled Claude task that pulls your Canvas to-do list every morning, reads the
instructions for each assignment, grabs transcripts of any linked videos, and writes
you a breakdown of what to do and what the videos said.

## How it works

1. `fetch_canvas.py` calls the Canvas REST API: active courses, planner (to-do) items,
   unsubmitted assignments with their full instructions, announcements from the last
   two days, incomplete module items, and every video link found inside any of those.
2. `get_transcripts.py` fetches captions for each video (YouTube captions first, then
   yt-dlp captions for Vimeo / Panopto / Kaltura / Loom / Zoom / raw mp4). With
   `BRIEF_WHISPER=1` it also downloads the audio and transcribes locally for videos
   that have no captions at all.
3. `build_brief.py` merges everything into `brief_raw.md`.
4. `notion_sync.py` upserts every to-do into the Notion **✅ Tasks** database
   (Simon HQ) under the School track: title, course, due, points, link, instructions.
   Rows are keyed by a Canvas ID so re-runs update instead of duplicating, and a row
   you ticked Done by hand stays done.
5. The scheduled Claude session reads `brief_raw.md`, writes the actual brief
   (due today / this week / overdue, announcements, a summary of each video, and a
   suggested order of attack), posts it as a page under **📚 Canvas Briefs** with
   `notion_brief.py`, and appends each video summary to its task row's Notes with
   `notion_sync.py --note <canvas_id> "<text>"`.

`run.sh` does steps 1 to 4 and prints the output folder.

## One-time setup (in the cloud environment settings)

Open the environment menu in the session title bar, choose Edit, and add:

**Secrets / environment variables**

| Variable | Value |
|---|---|
| `CANVAS_BASE_URL` | your Canvas address, e.g. `https://bostoncollege.instructure.com` |
| `CANVAS_TOKEN` | a Canvas access token: Canvas > Account > Settings > Approved Integrations > New Access Token |
| `CANVAS_COURSE_FILTER` | optional regex to limit courses, e.g. `BC` or `MKTG\|FIN` (leave unset for all active courses) |
| `BRIEF_TZ` | optional, default `America/Los_Angeles` |
| `BRIEF_DAYS_AHEAD` | optional, default `7` |
| `BRIEF_WHISPER` | optional, `1` to transcribe caption-less videos locally (slow) |
| `BRIEF_COOKIES_FILE` | optional path to a Netscape `cookies.txt` for SSO-gated video hosts like Panopto |
| `NOTION_TOKEN` | internal integration token from https://www.notion.so/profile/integrations. Then open **Simon HQ** in Notion, ••• menu > Connections > add the integration (this covers Tasks and Canvas Briefs underneath it) |
| `NOTION_TASKS_DS` | optional, defaults to the Simon HQ ✅ Tasks data source |
| `NOTION_BRIEFS_PAGE` | optional, defaults to the Simon HQ 📚 Canvas Briefs page |

**Network access > Allowed domains** (keep "Allow package managers" ticked)

- your Canvas host, e.g. `bostoncollege.instructure.com`
- `youtube.com`, `www.youtube.com`, `youtu.be`, `googlevideo.com`
- any other video hosts your courses use: `vimeo.com`, `*.panopto.com`, `*.kaltura.com`, `loom.com`, `zoom.us`
- `api.notion.com`

## Run it by hand

```bash
bash canvas-brief/run.sh
```

Then read `brief_raw.md` in the folder it prints.
