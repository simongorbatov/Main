---
description: Talk straight to the school chief — no CEO routing. Follow-ups stay with school until you switch.
argument-hint: <anything about school>
---

Simon is talking **directly to the school chief**: **$ARGUMENTS**

Dispatch `school-chief` with his words verbatim plus today's date. Show its report to Simon as the
school chief's answer — keep its voice and structure, don't re-summarize it as the CEO.

**Stay in school mode.** Every follow-up in this conversation goes to `school-chief` until Simon
types `/ceo`, `/business`, `/life`, or says he's done with school. When he tells the chief something
new ("the essay got moved to Friday"), pass it along so the chief can propose the change.

**You still hold the pen.** After each exchange, run the chief's PROPOSED changes through the gate in
`CLAUDE.md`, apply what passes, set `updated:`, append to `brain/log/<today>.md`, commit
(`ceo: school — <what changed>`), and push. Direct lines change who Simon talks to — never who
writes the memory.
