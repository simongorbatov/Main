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
4. The scheduled Claude session reads `brief_raw.md` and writes the actual brief:
   due today / this week / overdue, announcements, a summary of each video, and a
   suggested order of attack.

`run.sh` does steps 1 to 3 and prints the output folder.

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

**Network access > Allowed domains** (keep "Allow package managers" ticked)

- your Canvas host, e.g. `bostoncollege.instructure.com`
- `youtube.com`, `www.youtube.com`, `youtu.be`, `googlevideo.com`
- any other video hosts your courses use: `vimeo.com`, `*.panopto.com`, `*.kaltura.com`, `loom.com`, `zoom.us`

## Run it by hand

```bash
bash canvas-brief/run.sh
```

Then read `brief_raw.md` in the folder it prints.
