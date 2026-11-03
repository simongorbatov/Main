#!/usr/bin/env python3
"""Fetch a transcript for every video found by fetch_canvas.py.

Order of attempts per video:
  1. YouTube: youtube-transcript-api (captions, manual or auto-generated).
  2. Anything yt-dlp knows (YouTube, Vimeo, Panopto, Kaltura, Loom, Wistia, Zoom, raw mp4):
     download captions / auto-captions only, no video.
  3. If BRIEF_WHISPER=1: download audio with yt-dlp and transcribe locally with faster-whisper.
     Slow (minutes per hour of video on CPU) but works for videos with no captions at all.

Writes <out>/transcripts.json: {url: {"status": ok|failed, "method": ..., "text": ..., "error": ...}}
"""
import glob
import json
import os
import re
import subprocess
import sys
import tempfile

MAX_CHARS = int(os.environ.get("BRIEF_MAX_TRANSCRIPT_CHARS", "30000"))
USE_WHISPER = os.environ.get("BRIEF_WHISPER", "0") == "1"
COOKIES = os.environ.get("BRIEF_COOKIES_FILE", "")  # optional Netscape cookies.txt for SSO-gated video hosts

YT_ID_RE = re.compile(r"(?:youtube\.com/(?:watch\?v=|embed/|shorts/|live/)|youtu\.be/)([\w-]{11})")


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def youtube_captions(url):
    m = YT_ID_RE.search(url)
    if not m:
        return None
    from youtube_transcript_api import YouTubeTranscriptApi
    api = YouTubeTranscriptApi()
    tl = api.list(m.group(1))
    try:
        t = tl.find_transcript(["en", "en-US", "en-GB"])
    except Exception:
        t = next(iter(tl))
        if t.language_code != "en" and t.is_translatable:
            t = t.translate("en")
    return " ".join(s.text for s in t.fetch() if s.text.strip())


def vtt_to_text(path):
    lines, last = [], None
    with open(path, errors="ignore") as f:
        for line in f:
            line = line.strip()
            if not line or "-->" in line or line.isdigit() or line.startswith(("WEBVTT", "Kind:", "Language:", "NOTE")):
                continue
            line = re.sub(r"<[^>]+>", "", line)
            if line != last:
                lines.append(line)
                last = line
    return " ".join(lines)


def ytdlp(args, cwd):
    cmd = [sys.executable, "-m", "yt_dlp", "--no-playlist", "--quiet", "--no-warnings"]
    if COOKIES:
        cmd += ["--cookies", COOKIES]
    return subprocess.run(cmd + args, cwd=cwd, capture_output=True, text=True, timeout=1800)


def ytdlp_subs(url, tmp):
    r = ytdlp(["--skip-download", "--write-subs", "--write-auto-subs", "--sub-langs", "en.*,en",
               "--sub-format", "vtt/srt/best", "-o", "media.%(ext)s", url], tmp)
    files = glob.glob(os.path.join(tmp, "media*.vtt")) + glob.glob(os.path.join(tmp, "media*.srt"))
    if not files:
        raise RuntimeError((r.stderr or "no captions available").strip()[-400:])
    return vtt_to_text(files[0])


def whisper(url, tmp):
    r = ytdlp(["-f", "bestaudio/best", "-x", "--audio-format", "mp3", "--audio-quality", "9",
               "-o", "audio.%(ext)s", url], tmp)
    audio = glob.glob(os.path.join(tmp, "audio.*"))
    if not audio:
        raise RuntimeError((r.stderr or "audio download failed").strip()[-400:])
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "faster-whisper"], check=True)
        from faster_whisper import WhisperModel
    model = WhisperModel(os.environ.get("BRIEF_WHISPER_MODEL", "base.en"), device="cpu", compute_type="int8")
    segments, _ = model.transcribe(audio[0], vad_filter=True)
    return " ".join(s.text.strip() for s in segments)


def transcribe(url):
    attempts = [("youtube-captions", youtube_captions)] if YT_ID_RE.search(url) else []
    attempts.append(("yt-dlp-captions", ytdlp_subs))
    if USE_WHISPER:
        attempts.append(("whisper", whisper))
    errors = []
    for name, fn in attempts:
        with tempfile.TemporaryDirectory() as tmp:
            try:
                text = fn(url) if fn is youtube_captions else fn(url, tmp)
                if text and text.strip():
                    return {"status": "ok", "method": name, "text": text[:MAX_CHARS],
                            "truncated": len(text) > MAX_CHARS}
                errors.append(f"{name}: empty")
            except Exception as e:  # noqa: BLE001
                errors.append(f"{name}: {str(e)[:300]}")
    return {"status": "failed", "error": " | ".join(errors)}


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    with open(os.path.join(out_dir, "canvas.json")) as f:
        data = json.load(f)
    results = {}
    for v in data.get("videos", []):
        log(f"transcribing {v['url']}")
        results[v["url"]] = transcribe(v["url"])
        log(f"  -> {results[v['url']]['status']} ({results[v['url']].get('method') or results[v['url']].get('error')})")
    path = os.path.join(out_dir, "transcripts.json")
    with open(path, "w") as f:
        json.dump(results, f, indent=2)
    ok = sum(1 for r in results.values() if r["status"] == "ok")
    log(f"wrote {path}: {ok}/{len(results)} transcripts")


if __name__ == "__main__":
    main()
