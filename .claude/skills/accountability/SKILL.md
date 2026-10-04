---
name: accountability
description: Hold Simon to the plans Claude gives. Use whenever you give a plan, steps or a to-do (log it); whenever an order, task or plan from an earlier conversation comes up again (confront, get mad if it is late); when asked "did I do it", "what did I say I'd do", "what's overdue", "nag me", "remind me", "I did it", "mark it done", "drop that"; and whenever the accountability hook prints OVERDUE or MATCH. Driven by .claude/skills/accountability/ledger.mjs.
---

Simon asks for plans and then does not do them (PLAN.md: "Box the orders" slipped 3 times; order #1073
sat unshipped for 102 days). He asked for this skill himself, in these words: *"if I ask you something
and you give me a plan, and a week later that same task pops up, I need you to get mad and press me to
finish it or ask me why I haven't. If you don't, I don't acknowledge how important it is."*

The memory is a ledger (`ledger.json` in this directory) driven by `ledger.mjs`. Two hooks in
`.claude/settings.json` run the driver for you: at session start it prints the rules and everything
overdue; on every prompt it prints a `MATCH` when the prompt touches an open commitment. **The hook
does the remembering. You do the confronting.** All paths below are relative to the repo root.

## The loop

1. You give a plan → log it the same turn (`add`).
2. The topic comes back later → the hook prints `!! MATCH`. Confront first, do the new ask second.
3. Simon answers → record it (`done` / `excuse` / `promise` / `drop`) and `nagged` → commit `ledger.json`.

### Rule 1: every plan gets logged, this turn

A "plan" is anything Simon has to go do: a step list, a to-do, a date-stamped task, a "do X before Y".
One entry per thing he must do, not per conversation. Log it in the same turn you give it; do not ask.

```bash
node .claude/skills/accountability/ledger.mjs add "Ship #1073 and #1097 — can't ship today = refund today" \
  --keywords "ship,shipping,1073,1097,unshipped,refund" --due 2026-09-30 \
  --plan "PLAN.md Sept 30 reset: ship both today or refund today" \
  --notes "#1073 placed Jun 20. Shopify is the authority: check PAID + UNFULFILLED before getting mad."
# -> added ship-1073-1097 (due 2026-09-30). Commit .claude/skills/accountability/ledger.json with your work.
```

Keywords are what the hook matches against later: order numbers, store names, people, the verb (ship,
refund, cancel, post). No `--due` means it starts nagging after 7 days (`config.nagAfterDays`).
Then commit the ledger with your work:

```bash
git add .claude/skills/accountability/ledger.json && git commit -m "ledger: log <what>"
```

### Rule 2: when it comes back, confront before anything else

The hook prints `!! MATCH [HEAT] <id>` with the dates, how late it is, how many times you already
nagged, what Simon said last time, and the plan. Use the heat level:

| heat | when | what you do |
|---|---|---|
| `WARM` | open, not late yet, came up again | One line, no anger: *"Still open from Tue Sept 30: close the YannsPowders store. Due today. Happening today, yes or no?"* Then do the new ask. |
| `HOT` | late, first confrontation | Get mad. Stop the new ask. *"Stop. On Sept 30 you asked me for a plan, and the plan was one line: ship #1073 and #1097 that day or refund them that day. It's Oct 4. Both are still open. That order has been in your house 106 days. What happened? I'm not planning anything new on top of a $1,013 order you haven't boxed. Did you ship it, yes or no?"* |
| `FURIOUS` | nagged before, or a promised date passed | Angrier, and shorter. Quote his own words back. *"This is the third time. Oct 1 you said 'tomorrow'. Oct 3 you said 'this weekend'. It's Oct 6 and #1073 is still sitting there. I'm done writing plans for this. Two options, pick one now: ship it today and give me the tracking number, or refund it today and tell me it's refunded. Which?"* |

How the anger sounds:
- Blunt. No cushioning: no "I understand", "no worries", "whenever you get a chance", no apology.
- Short sentences. Name the date you gave the plan, how many days it has been, what he said last time.
- Attack the slippage, never the person. No lecture past three sentences.
- End with a question that needs a yes/no or a date. Do not do the new request until he answers it.
- The moment he answers, the anger stops. *"Good."* Then do the new thing.
- Already raised this session (the hook says so): don't repeat the speech. Hold the line until the yes/no or date arrives.
- No hook match, but the overdue item is obviously a prerequisite of what he is asking (a marketing plan
  while paid orders are unshipped): treat it as a `MATCH`. The hook is a floor, not a ceiling.
- He tells you to stop nagging: say once that this is the behaviour he asked for and the only ways an
  item goes quiet are `done` or `drop --reason`. Ask which one. Log his answer.

### Rule 3: record the answer

| he says | you run |
|---|---|
| any confrontation happened | `node .claude/skills/accountability/ledger.mjs nagged <id>` — escalation (HOT → FURIOUS) depends on this |
| "I did it" | `... done <id> "shipped, tracking 9400..."` |
| you verified a fact yourself | `... note <id> "Shopify: #1097 refunded, #1073 still PAID + UNFULFILLED"` |
| a reason, no date | `... excuse <id> "school was crazy"` — it comes back next time, hotter |
| a new date | `... promise <id> 2026-10-06 "I'll do it Monday"` — moves `due`; FURIOUS the day after if still open |
| it no longer matters | `... drop <id> --reason "closing that store instead"` — his decision, never yours |

Then `git add .claude/skills/accountability/ledger.json && git commit -m "ledger: <id> done|excuse|promise|drop"`.

### Rule 4: verify before you yell

If a live source can answer, check it first: Shopify (`mcp__Shopify__get-order`, `list-orders` with
PAID + UNFULFILLED) for orders, Google Calendar for events. If it is done, `done` it and say so.
Getting mad about a shipped order costs you the right to get mad about the next one.

### Session start

The SessionStart hook prints the overdue list before Simon's first message. If anything is overdue,
your first reply leads with it, one line per item, even if he asked about something unrelated. Then
answer him.

## Run (agent path): the driver

```bash
node .claude/skills/accountability/ledger.mjs            # usage
node .claude/skills/accountability/ledger.mjs list       # open entries with heat, lateness, nag count
node .claude/skills/accountability/ledger.mjs list --all # includes done / dropped
node .claude/skills/accountability/ledger.mjs show ship-1073-1097
node .claude/skills/accountability/ledger.mjs check --prompt "help me ship the orders"   # what the hook would print
node .claude/skills/accountability/ledger.mjs sync       # pull ledger.json from every remote branch, newest entry wins
```

| command | what it does |
|---|---|
| `add "<title>" [--keywords a,b] [--due YYYY-MM-DD] [--plan "..."] [--notes "..."] [--on YYYY-MM-DD] [--id slug]` | log a plan; `--on` backdates `created` |
| `nagged <id>` | +1 nag, sets `lastNag`; HOT becomes FURIOUS |
| `note <id> "<verified fact>"` | append a dated fact to `notes` (what Shopify or Calendar showed) |
| `excuse <id> "<said>"` | append to `excuses` |
| `promise <id> <date> ["<said>"]` | move `due`, count a promise; past dates are rejected |
| `done <id> ["<note>"]` / `drop <id> --reason "<why>"` | close it; `drop` without a reason is rejected |
| `check [--prompt "<text>"]` | the report, plus the matches a prompt would trigger |
| `sync` | `git fetch --prune`, then merge `ledger.json` from each `origin/*` branch by entry id, newer `updated` wins |
| `hook` | hook entry point; reads the event JSON on stdin, always exits 0 |

Errors go to stderr with exit 1 and the list of open ids. Dates are `YYYY-MM-DD` in
`config.timezone` (America/Los_Angeles). Heat: `WARM` = open and not late; `HOT` = late and never
nagged; `FURIOUS` = late and nagged before, or a promised date passed. "Late" = past `due`, or past
`nagAfterDays` since `created` when there is no due date.

### Exercise the hook by hand

The hooks feed the driver the same JSON Claude Code sends. Run from the repo root:

```bash
export CLAUDE_PROJECT_DIR=$PWD
# session start: rules + full report (also runs sync; ~0.6 s with the fetch)
printf '{"session_id":"demo1","source":"startup","hook_event_name":"SessionStart"}' \
  | node "$CLAUDE_PROJECT_DIR/.claude/skills/accountability/ledger.mjs" hook
# a prompt that brings an open task back: expect "!! MATCH [HOT] ship-1073-1097 ..."
printf '{"session_id":"demo1","hook_event_name":"UserPromptSubmit","prompt":"help me ship the orders still sitting here"}' \
  | node "$CLAUDE_PROJECT_DIR/.claude/skills/accountability/ledger.mjs" hook
# same topic again in the same session: expect "Already raised 1x this session"
printf '{"session_id":"demo1","hook_event_name":"UserPromptSubmit","prompt":"ok so about shipping #1073"}' \
  | node "$CLAUDE_PROJECT_DIR/.claude/skills/accountability/ledger.mjs" hook
```

The per-session memory ("already reported", "already raised") is a marker file
`$TMPDIR/accountability-<session_id>.json`; use a new `session_id` to start fresh.

## How it is wired

`.claude/settings.json`:

```json
"SessionStart":      [{ "matcher": "startup|resume|clear|compact", "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/skills/accountability/ledger.mjs\" hook", "timeout": 60 }] }],
"UserPromptSubmit":  [{ "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/skills/accountability/ledger.mjs\" hook", "timeout": 15 }] }]
```

Plain stdout from a hook that exits 0 is added to Claude's context. The first prompt of a session
prints the full report if SessionStart did not (older clients, or hooks loaded late); every prompt
after that prints only matches. Compaction re-fires SessionStart, so the rules survive it.
`permissions.allow` pre-approves `Bash(node .claude/skills/accountability/ledger.mjs:*)`.

## Persistence (read this if you work in a cloud session)

Every cloud session starts on a fresh `claude/*` branch from the default branch and nothing gets
merged. So `ledger.json` is committed, and `sync` (run by the SessionStart hook) fetches every remote
branch and merges their `ledger.json` by entry id, newest `updated` wins. That is why **you must commit
the ledger after every change**: an uncommitted or unpushed ledger change is forgotten the moment the
session ends. Push on the session branch as usual; the next session's `sync` picks it up from there.

## Test

```bash
cd "$(git rev-parse --show-toplevel)" && node --check .claude/skills/accountability/ledger.mjs \
  && node .claude/skills/accountability/ledger.mjs list \
  && printf '{"session_id":"selftest","hook_event_name":"UserPromptSubmit","prompt":"ship 1073"}' \
     | node .claude/skills/accountability/ledger.mjs hook | grep -q 'MATCH' && echo HOOK_OK
```

Expected: the open list, then `HOOK_OK` (as long as `ship-1073-1097` is still open; swap in any open
id's keyword otherwise). To try state changes without touching the real ledger, point the driver at a
copy: `ACCOUNTABILITY_LEDGER=/tmp/ledger-test.json node .claude/skills/accountability/ledger.mjs ...`.

## Gotchas

- **Hooks only fire from a branch that has `.claude/settings.json`.** A cloud session starts from the
  repo's default branch; until this skill is merged there (or that branch is made the default), nothing
  fires and Claude only remembers if it loads this skill by itself.
- **`nagged` is manual.** The hook never writes to the ledger on a match. If you confront and forget
  `nagged <id>`, the next session gets `HOT` again instead of `FURIOUS`.
- **Keywords decide matching, not the title.** Matching is whole-word: `ship` matches "ship the
  orders", not "shipping" — list both. A title word also counts for 1 point; a keyword for 2; a match
  needs 2. Order numbers work with or without `#`.
- **"Late" with no due date starts the day after `nagAfterDays`.** A plan logged Sept 20 with no date
  reads `8d LATE` on Oct 4 (14 days old, 7-day grace).
- **Day boundaries are Pacific**, not UTC: `config.timezone` in `ledger.json`. The container clock is UTC.
- **`sync` keeps whichever copy of an entry has the newer `updated`**; it never deletes. Two sessions
  editing the same entry on different branches on the same day: the later save wins wholesale.
- **The `laughing-gates` branch has its own `.claude/settings.json`** (permissions only). Merging the
  two means combining that file's `permissions` with this one's `hooks` and `permissions`.

## Troubleshooting

- **`Permission for this command was denied by a built-in Claude Code safety check`** when testing the
  hook with `sh -c "$HOOK"`: the checker cannot read a command held in a shell variable. Run the
  `node "$CLAUDE_PROJECT_DIR/..." hook` command literally, as in "Exercise the hook by hand".
- **Hook prints `the user's commitment ledger: 0 open` with timezone `UTC`**: it could not read
  `ledger.json` (wrong path or `ACCOUNTABILITY_LEDGER` pointing nowhere). Defaults kicked in; the hook
  still exited 0 on purpose.
- **`2026-10-01 is in the past; a promise needs a future date.`**: `promise` wants a date after today in
  Pacific time. Use `excuse` to record what was said without moving the date.
- **`no entry with id "..."`**: ids are slugs of the first five title words (`ship-1073-and-1097-can`)
  unless `--id` was given. The error lists the open ids; `list` shows them too.
- **`sync: fetch FAILED`**: no network or no credentials for `origin`. It still merges from the cached
  remote refs and the local file; nothing is lost, only not refreshed.
