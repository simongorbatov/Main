---
description: Every project at a glance — one line each, straight from the front matter.
argument-hint: "[school | business | life]"
---

Show every project, or only one chief's if given: **$ARGUMENTS**

Grep `^(name|status|priority|next_action|due|updated):` across `chiefs/*/projects/*.md` (or just
`chiefs/$ARGUMENTS/projects/*.md`). Don't read the files in full — the front matter is enough.

Print one table per chief — active projects sorted by `priority` (1 first), then `due`; then
`needs-import` ones; then parked/done:

```
SCHOOL
  P1  Calc 2        active   Problem set 4               Fri Sept 25   ⚠ overdue
  ...

BUSINESS
  P1  PNW $5k month active   Ship the 5 unshipped orders Sat Sept 26
  P2  Coatify       needs import
```

Mark `⚠ overdue` when `due` is before today, and `· stale` when `updated` is 14+ days old. Parked and
done projects go at the bottom of each chief, dimmed or in a short "parked:" line.

If a chief has no projects, show `(none yet — run /ceo to set up)`.

This command only reads. Don't change or commit anything.
