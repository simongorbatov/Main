# Simon's second brain

One CEO you talk to. Three chiefs under it. Every project in a file, so nothing is ever re-explained.

```
                        you
                         │
                       CEO  ← approves everything, only one who writes
          ┌──────────────┼──────────────┐
       school        business          life     ← read-only, propose changes
          │              │               │
      projects/      projects/       projects/
          │              │               │
   Calendar·Gmail   Shopify·Gmail   Calendar·Gmail
      ·Notion      ·Calendar·Notion    ·Notion
```

## Talk to it

| Type | What happens |
|---|---|
| `/ceo what's due for school this weekend` | CEO sends it to the right chief, approves the answer, tells you. |
| `/ceo what's my week look like` | All three chiefs at once, one answer. |
| `/brief` | The daily brief, on demand. Also runs itself every morning at 7:00. |
| `/school …` `/business …` `/life …` | Straight to that chief. Follow-ups stay with it until you switch. |
| `/project calc-2` | Open one project and work only on it. |
| `/projects` | Everything, one line each, priority 1 first. `/projects school` for one chief. |
| `/new-project school AP Bio` | Start a new project. |

**First time:** run `/ceo` with nothing after it. It asks which projects can never slip, then imports
your Claude Projects one at a time, most important first. For each one you paste its instructions and
files, the chief checks your calendar and inbox, and you get a real project file. The chiefs **can't
read Claude Projects on their own**. Nothing crosses over until you paste it.

## Projects and priority

| Chief | Projects |
|---|---|
| School | English 101 · Calc 2 |
| Business | PNW $5k month · Shopify · Marketing · Coatify · Business |
| Life | New House · Health · Money · Life dashboard · Calendar · Work flow planning |

Every project has `priority:` **1** (can't slip), **2** (important) or **3** (when there's time).
Everything is sorted by priority first, then due date. When two things clash, the higher one wins.

Chiefs can **read each other's** projects, so life sees store income when house costs come up and
business sees your school week before planning weekend work. They can only suggest changes to their
own. Anything for another chief goes to the CEO.

## Who's allowed to do what

| | Read files & connectors | Change the memory | Send email, touch Shopify, book things |
|---|---|---|---|
| Chiefs | ✅ all chiefs' projects | ❌ propose only | ❌ |
| CEO | ✅ | ✅ commits every change | ❌ asks you |
| You | — | — | ✅ always asked first |

Chiefs physically have no write tools — it's in their definitions, not a promise. Sending email,
Shopify changes, and calendar edits always pop a permission prompt, even if the CEO decides to.

## Where things live

```
CLAUDE.md                        the CEO's brain — loads automatically every session
brain/me.md                      who you are: timezone, school hours, training
brain/state.md                   last snapshot (a cache — chiefs always re-check)
brain/log/YYYY-MM-DD.md          what was asked, decided and changed, every day
chiefs/<chief>/CHIEF.md          that chief's rules and its one number
chiefs/<chief>/projects/*.md     one file per project
chiefs/_TEMPLATE.md              shape of every project file
.claude/agents/                  the three chiefs
.claude/commands/                the slash commands above
.claude/settings.json            what runs without asking, what always asks
```

The PNW Customs $5k plan is at `chiefs/business/projects/pnw-30-day-5k.md`.

## If something's off

- **A chief can't see Gmail/Calendar/Shopify/Notion** — the connector isn't connected in this
  environment. Connector tool names here are `mcp__Gmail__…` etc.; if you run Claude Code on your own
  computer they may be `mcp__claude_ai_Gmail__…` and the chiefs' `tools:` lists need matching.
- **The brief didn't arrive** — check Routines in claude.ai. It reads and writes the `main` branch.
- **Brief arrives at 6:00 after Nov 1** — daylight saving ended. Move the Routine's cron from
  `0 14 * * *` to `0 15 * * *`.
