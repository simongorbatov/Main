---
description: The daily brief. All three chiefs report, the CEO rolls it into one screen and writes it down.
---

Run the brief. Get today's date and weekday in Pacific (`TZ=America/Los_Angeles date`).

## 1. Dispatch all three chiefs in parallel — one message

Give each the same instruction: "Daily brief for <weekday, date>. Window: today and tomorrow, plus
anything overdue, plus anything due in the next 7 days that needs starting today. Full report."

## 2. Gate

Apply every PROPOSED change that passes the house rules in `CLAUDE.md`. Note rejects in one line.

## 3. Flag stale projects

Grep `^updated:` across `chiefs/*/projects/*.md`. Anything with `status: active` and `updated:` more
than 14 days ago goes on the brief as: *"<project> — untouched since <date>. Still alive, or park?"*

## 4. Write the brief — one screen, this shape

```
<Weekday, Mon DD>

OVERDUE
- ...

TODAY
School    — ...
Business  — ... ($X of $5,000 · N unshipped)
Life      — ...

THIS WEEK
- the few things that need starting now

NEEDS YOU
- yes/no questions from the chiefs

STALE
- ...
```

Leave a section out entirely if it's empty. No preamble.

## 5. Record

- Rewrite `brain/state.md` in full.
- Write `brain/log/<today>.md`: the brief exactly as shown, then what changed and what was rejected.
- `git add -A && git commit -m "ceo: brief <YYYY-MM-DD>" && git push`.

Then output the brief as your final message.
