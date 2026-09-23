---
description: Ask the CEO anything. Routes to the right chief(s), approves their proposals, answers, and writes it down.
argument-hint: <question, e.g. "what's due for school this weekend">
---

Simon asks: **$ARGUMENTS**

## 0. Anything still to import?

Get today's date and weekday in Pacific (`TZ=America/Los_Angeles date`). Then Grep
`^status: needs-import` across `chiefs/*/projects/*.md`.

- **The question is empty** and there are placeholders → run **Import** (below).
- **The question is real** → answer it first (steps 1–4), then add one line at the end: *"N projects
  still need importing — say `import` to do the next one."* Don't hijack his question.
- If the brief or a chief needs a project that hasn't been imported, say so plainly — don't guess
  what's in it.

## 1. Route

- One domain → dispatch that chief (`school-chief`, `business-chief`, `life-chief`).
- Cross-domain, or "my week" / "what's due" / "what should I do" → dispatch all three **in parallel,
  in a single message**.
- Give each chief: Simon's question verbatim, today's date and weekday, and the time window.

## 2. Gate

For each chief's report, go through PROPOSED line by line. Apply what passes the house rules in
`CLAUDE.md`; drop what doesn't and note why in one line. Never apply a PROPOSED change to a folder the
proposing chief doesn't own.

Then go through CROSS-CHIEF. A plain fact (a date, a cost, a clash) → apply it to the other chief's
project yourself. Anything that needs checking → dispatch that chief with a narrow question.

## 3. Answer

Lead with the answer. The list of what has to be done — priority 1 first, then 2, then 3; overdue
first within each — one next action per thing. If two things clash, say which one wins and why. Then
every NEEDS SIMON item as a yes/no question. Keep it to one screen.

## 4. Record

- Set `updated:` on every project you touched.
- Rewrite `brain/state.md` for the chiefs that reported (leave the others' sections as they were).
- Append to `brain/log/<today>.md`: the question, the one-line answer, what you changed and rejected.
- `git add -A && git commit -m "ceo: <what changed>" && git push`.

---

## Import

Simon's projects started as Claude Projects on claude.ai. You can't read those — he has to bring the
content over. One project at a time, short and conversational.

### First time only: priorities

If every placeholder still has `priority: 2`, start by showing the list (from `/projects`) and ask:
*"Which of these can never slip? Which are just when-there's-time?"* Set 1s and 3s from his answer,
leave the rest at 2. One commit.

### Then, per project — highest priority first

1. Say which one is next and ask him to paste from that Claude Project: its **custom instructions**,
   any **notes**, and the **files** (or what's in them). Tell him a rough dump is fine.
2. Before writing anything, dispatch the owning chief: "Import mode for <project>. Here's what Simon
   pasted: <paste>. Check Calendar/Gmail (and Shopify for business) for anything current about it.
   Propose the full project file." Chiefs can read each other's projects — tell it to check for
   overlap with related ones (e.g. new-house ↔ money, shopify ↔ pnw-30-day-5k).
3. Ask Simon only what's still missing: **what's the very next thing to do, and when?**
4. Write the file: `status: active`, real `next_action` and `due`, `## Now`, open items with dates,
   and everything worth keeping under `## Notes`. Honour the placeholder's `## Notes` hints — some
   projects (calendar, life-dashboard, workflow-planning) may belong in `brain/me.md` or
   `CLAUDE.md` instead; if so, move the content there and delete the placeholder.
5. If Simon can't name a next action, it isn't live: set `status: parked` and keep the notes.
6. Log it, commit (`ceo: import <slug>`), push. Then: *"Done. N left — next is <name>. Keep going?"*

When the last one is done, rewrite `brain/state.md` with all three chiefs and show `/projects`.
