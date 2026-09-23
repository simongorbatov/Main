---
description: Ask the CEO anything. Routes to the right chief(s), approves their proposals, answers, and writes it down.
argument-hint: <question, e.g. "what's due for school this weekend">
---

Simon asks: **$ARGUMENTS**

## 0. Is the system set up?

Get today's date and weekday in Pacific (`TZ=America/Los_Angeles date`). Then Glob
`chiefs/school/projects/*.md` and `chiefs/life/projects/*.md`.

If either returns **nothing**, run **Intake** (below) first — then answer the question with what
you've just learned. If the question is empty, just run intake.

## 1. Route

- One domain → dispatch that chief (`school-chief`, `business-chief`, `life-chief`).
- Cross-domain, or "my week" / "what's due" / "what should I do" → dispatch all three **in parallel,
  in a single message**.
- Give each chief: Simon's question verbatim, today's date and weekday, and the time window.

## 2. Gate

For each chief's report, go through PROPOSED line by line. Apply what passes the house rules in
`CLAUDE.md`; drop what doesn't and note why in one line. Never apply a change to a folder the
proposing chief doesn't own.

## 3. Answer

Lead with the answer. The list of what has to be done, overdue first, in date order, one next action
per thing. Then every NEEDS SIMON item as a yes/no question. Keep it to one screen.

## 4. Record

- Set `updated:` on every project you touched.
- Rewrite `brain/state.md` for the chiefs that reported (leave the others' sections as they were).
- Append to `brain/log/<today>.md`: the question, the one-line answer, what you changed and rejected.
- `git add -A && git commit -m "ceo: <what changed>" && git push`.

---

## Intake

The chiefs have nothing to read, so the first job is filling them. Interview Simon — **one question
at a time**, short, conversational. Don't dump a form on him.

Before asking anything, look first so you're confirming rather than interrogating:
- Dispatch `school-chief` and `life-chief` in parallel: "Intake mode — no project files exist yet.
  Scan Calendar for the next 14 days and Gmail for the last 30 days. Report every recurring event,
  class, teacher, assignment, appointment and deadline you can find, grouped by what looks like a
  class or life area."
- Use what comes back to ask better questions: *"Calendar has chem lab Thursdays and a Canvas email
  about a lab writeup — is that your AP Chem class?"*

Then walk through, in this order:

1. **Schedule** — school start/end times, training days and times. → update `brain/me.md`.
2. **Classes** — for each class: name, teacher, what's due next and when, anything missing or late.
   → one file per class in `chiefs/school/projects/<class-slug>.md` from `chiefs/_TEMPLATE.md`.
3. **School's one number** — what does "school is going well" mean this quarter? → `CHIEF.md`.
4. **Life areas** — training, health, money, car/licence, family, anything else on his mind. Only
   make a project file for an area that has a real next action right now.
5. **Life's one number** → `chiefs/life/CHIEF.md`.

Rules: every project file needs a real `next_action` and `due`. If Simon can't name a next action,
it isn't a project — note it in the chief's `CHIEF.md` under "Someday" instead.

When done: remove the `.gitkeep` files from folders that now have projects, rewrite
`brain/state.md` with all three chiefs, log it, commit (`ceo: intake — <n> school, <n> life
projects`), push. Then show Simon `/projects` and tell him intake is finished.
