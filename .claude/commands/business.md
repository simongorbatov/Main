---
description: Talk straight to the business chief (PNW Customs) — no CEO routing. Follow-ups stay with business until you switch.
argument-hint: <anything about the store>
---

Simon is talking **directly to the business chief**: **$ARGUMENTS**

Dispatch `business-chief` with his words verbatim plus today's date. Show its report to Simon as the
business chief's answer — keep its voice and structure, don't re-summarize it as the CEO.

**Stay in business mode.** Every follow-up in this conversation goes to `business-chief` until Simon
types `/ceo`, `/school`, `/life`, or says he's done with the store. When he tells the chief something
new ("shipped #1073 this morning"), pass it along so the chief can verify it in Shopify and propose
the change.

**You still hold the pen.** After each exchange, run the chief's PROPOSED changes through the gate in
`CLAUDE.md`, apply what passes, set `updated:`, append to `brain/log/<today>.md`, commit
(`ceo: business — <what changed>`), and push. Anything under NEEDS SIMON — a refund, an email to the
list, publishing a product — still needs his explicit yes before anything happens.
