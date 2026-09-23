---
description: Start a new project under a chief, from the template.
argument-hint: <school|business|life> <project name>
---

New project: **$ARGUMENTS**

The first word is the chief (`school`, `business`, or `life`); the rest is the project name. If the
chief is missing or wrong, ask.

1. Slug the name (lowercase, hyphens) → `chiefs/<chief>/projects/<slug>.md`. If it exists, say so and
   offer `/project <slug>` instead.
2. Ask Simon, one at a time and only what you can't infer: **What's the very next thing to do?** and
   **When is it due?**
3. If he can't name a next action, don't create the file — it isn't a project yet. Add it to
   `chiefs/<chief>/CHIEF.md` under a `## Someday` heading and stop.
4. Otherwise copy `chiefs/_TEMPLATE.md`, fill the front matter (`chief`, `name`, `status: active`,
   `next_action`, `due`, `sources`, `updated: <today>`) and `## Now`. Clear the template's example
   lines.
5. Remove `chiefs/<chief>/projects/.gitkeep` if present.
6. Log it in `brain/log/<today>.md`, commit (`ceo: new <chief> project — <name>`), push.
