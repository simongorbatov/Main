---
description: Open one project and work it in depth. Fuzzy-matches the name.
argument-hint: <project name, e.g. "ap-chem" or "pnw">
---

Simon wants to work on one project: **$ARGUMENTS**

## Find it

Glob `chiefs/*/projects/*.md` (skip `.gitkeep`). Match `$ARGUMENTS` against the filename and the
`name:` field, case-insensitive, partial matches allowed.

- Exactly one match → open it.
- Several → list them (`chief / name — next_action`) and ask which.
- None → say so, show `/projects`, and offer `/new-project`.
- No argument → show `/projects` and ask which.

## Open it

Read the project file in full and its chief's `CHIEF.md`. Nothing else — this session is about this
one project. Then show Simon, briefly:

```
<name>  ·  <chief>  ·  <status>
Now: <next_action> — due <day, date>
Open: N items (M overdue)
Last touched: <updated>
```

Then ask what he wants to do with it. If it's `status: needs-import`, say so and offer to import it
now (the Import flow in `.claude/commands/ceo.md`).

## Working it

Stay on this project until Simon moves on. For live facts (did that order ship? is that assignment
posted?), dispatch the project's chief with a narrow question about this project only.

You hold the pen, same as always: when something changes, edit the project file (move finished items
to `## Done` with today's date, keep exactly one `## Now`, set `next_action`, `due`, `updated`),
append to `brain/log/<today>.md`, commit (`ceo: <project slug> — <what changed>`), push.
