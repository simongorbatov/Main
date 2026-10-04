#!/usr/bin/env node
// ledger.mjs — commitment ledger + Claude Code hook for the `accountability` skill.
//
// Zero dependencies, Node 18+. The ledger is ledger.json next to this file.
//
//   node .claude/skills/accountability/ledger.mjs <command> [args]
//
// Commands (see SKILL.md for when to run each):
//   add "<title>" [--keywords a,b,c] [--due YYYY-MM-DD] [--plan "<one line>"] [--notes "<text>"]
//                 [--on YYYY-MM-DD] [--id <slug>]        log a plan you just gave; prints the id
//   list [--all]                                           open entries (--all: done/dropped too)
//   show <id>                                              one entry as JSON
//   check [--prompt "<text>"]                              what the hook would say, as a human-readable report
//   nagged <id>                                            record that you confronted him about <id>
//   note <id> "<verified fact>"                           append a dated fact you verified (Shopify, Calendar) to notes
//   excuse <id> "<what they said>"                         record the reason given for not doing it
//   promise <id> <YYYY-MM-DD> ["<what they said>"]         a new date was promised: moves `due`, counts as a promise
//   done <id> ["<note>"]                                   it is done
//   drop <id> --reason "<why>"                             the user decided it no longer matters (reason is required)
//   sync                                                   merge ledger.json from every remote branch (newest wins)
//   hook                                                   Claude Code hook entry point (reads the event JSON on stdin)
//
// `hook` ALWAYS exits 0 and never blocks a prompt. Everything it prints becomes context for Claude.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LEDGER_PATH = process.env.ACCOUNTABILITY_LEDGER || path.join(HERE, 'ledger.json');
const LEDGER_REL = '.claude/skills/accountability/ledger.json'; // path inside the repo, used by `sync` (git show)
const CLI = 'node .claude/skills/accountability/ledger.mjs';
const SKILL_REL = '.claude/skills/accountability/SKILL.md';

const DEFAULTS = { owner: 'the user', timezone: 'UTC', nagAfterDays: 7 };
const STOPWORDS = new Set(('a an and or the to of for in on at by with from my me you your yours it its is are be was do did ' +
  'does done i we he she they them this that these those can could should would will want need help make made get got ' +
  'set up out about again still just like also any some all more new old plan plans planning task tasks thing things ' +
  'how what when where why which who please let lets go going ok okay yes no not').split(' '));

// ---------- small helpers ----------
function todayIn(tz) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
  catch { return new Date().toISOString().slice(0, 10); }
}
function isDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')); }
function daysBetween(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }
function slugify(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').split('-').filter(Boolean).slice(0, 5).join('-') || 'item'; }
function tokens(s) { return String(s).toLowerCase().replace(/[^a-z0-9#$]+/g, ' ').split(' ').map(t => t.replace(/^[#$]+/, '')).filter(t => t.length >= 3 && !STOPWORDS.has(t)); }
function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }
function nowIso() { return new Date().toISOString(); }
function fail(msg) { process.stderr.write(msg + '\n'); process.exit(1); }

function parseArgs(argv) {
  const pos = []; const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) { flags[k] = argv[++i]; } else { flags[k] = true; }
    } else pos.push(a);
  }
  return { pos, flags };
}

// ---------- ledger io ----------
function load() {
  const db = readJson(LEDGER_PATH) || {};
  db.version = 1;
  db.config = { ...DEFAULTS, ...(db.config || {}) };
  db.entries = Array.isArray(db.entries) ? db.entries : [];
  return db;
}
function save(db) { fs.writeFileSync(LEDGER_PATH, JSON.stringify(db, null, 2) + '\n'); }
function find(db, id) {
  const e = db.entries.find(x => x.id === id);
  if (!e) fail(`no entry with id "${id}". Open ids: ${db.entries.filter(x => x.status === 'open').map(x => x.id).join(', ') || '(none)'}`);
  return e;
}
function touch(e) { e.updated = nowIso(); }

// ---------- state derivation ----------
function state(db, e) {
  const today = todayIn(db.config.timezone);
  const age = isDate(e.created) ? daysBetween(e.created, today) : 0;
  const nagAfter = Number(db.config.nagAfterDays) || 7;
  let daysLate = 0, dueToday = false, dueIn = null;
  if (isDate(e.due)) {
    const d = daysBetween(e.due, today);
    if (d > 0) daysLate = d; else if (d === 0) dueToday = true; else dueIn = -d;
  } else if (age >= nagAfter) {
    daysLate = age - nagAfter + 1; // a plan with no date is "late" once it has sat for nagAfterDays
  }
  const excuses = Array.isArray(e.excuses) ? e.excuses : [];
  const promises = excuses.filter(x => isDate(x.promisedBy)).length;
  const brokenPromises = excuses.filter(x => isDate(x.promisedBy) && x.promisedBy < today).length;
  const nags = Number(e.nags) || 0;
  const overdue = daysLate > 0;
  let heat = 'warm';
  if (overdue) heat = (nags === 0 && brokenPromises === 0) ? 'hot' : 'furious';
  return { today, age, daysLate, dueToday, dueIn, overdue, nags, promises, brokenPromises, heat, excuses, nagAfter };
}

function matchScore(e, prompt) {
  const p = ' ' + String(prompt).toLowerCase().replace(/[^a-z0-9#$]+/g, ' ').replace(/[#$]/g, '') + ' ';
  const ptoks = new Set(tokens(prompt));
  let score = 0; const hits = [];
  for (const kw of (e.keywords || [])) {
    const k = String(kw).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (k && p.includes(' ' + k + ' ')) { score += 2; hits.push(kw); }
  }
  for (const t of new Set(tokens(e.title))) if (ptoks.has(t)) { score += 1; hits.push(t); }
  return { score, hits: [...new Set(hits)] };
}

// ---------- formatting ----------
function line(db, e) {
  const s = state(db, e);
  const bits = [];
  if (s.overdue) bits.push(`${s.daysLate}d LATE`);
  else if (s.dueToday) bits.push('DUE TODAY');
  else if (s.dueIn !== null) bits.push(`due in ${s.dueIn}d`);
  else bits.push(`day ${s.age + 1} of ${s.nagAfter}`);
  if (isDate(e.due)) bits.push(`due ${e.due}`);
  bits.push(`planned ${e.created}`);
  if (s.nags) bits.push(`nagged ${s.nags}x`);
  if (s.brokenPromises) bits.push(`${s.brokenPromises} broken promise${s.brokenPromises > 1 ? 's' : ''}`);
  return `- ${e.id} [${s.heat.toUpperCase()}] ${bits.join(' · ')}: ${e.title}`;
}

function rulesBlock(db) {
  const who = db.config.owner;
  return [
    `RULES (non-negotiable, details in ${SKILL_REL}):`,
    `1. Every plan, step list or to-do you give ${who} gets logged THIS TURN: ${CLI} add "<title>" --keywords a,b,c --due YYYY-MM-DD --plan "<one line>"`,
    `2. An OVERDUE item below, or a MATCH on a later prompt, and the topic comes back: confront FIRST, do the new ask SECOND. Was it done? If not, why not? Push for a yes/no or a date.`,
    `3. After confronting: ${CLI} nagged <id>. Then done / excuse / promise / drop <id> from the answer you get. Then commit ledger.json (it is the only memory that survives this session).`,
    `4. Verify in a live source first when one exists (Shopify for orders, Calendar for events). Done is done: mark it, say "good", move on.`,
  ].join('\n');
}

function report(db, { rules } = {}) {
  const open = db.entries.filter(e => e.status === 'open');
  const overdue = open.filter(e => state(db, e).overdue);
  const rest = open.filter(e => !state(db, e).overdue);
  const out = [];
  out.push(`[accountability] ${db.config.owner}'s commitment ledger: ${open.length} open, ${overdue.length} OVERDUE (today ${todayIn(db.config.timezone)} ${db.config.timezone}).`);
  if (rules) out.push(rulesBlock(db));
  if (overdue.length) {
    out.push(`OVERDUE — get mad, hotter each time (HOT = first confrontation, FURIOUS = nagged before or a promise was broken):`);
    for (const e of overdue) {
      out.push(line(db, e));
      const s = state(db, e);
      const last = s.excuses[s.excuses.length - 1];
      if (last) out.push(`    last time (${last.date}) ${db.config.owner} said: "${last.said}"${isDate(last.promisedBy) ? ` and promised ${last.promisedBy}` : ''}`);
      if (e.notes) out.push(`    notes: ${e.notes}`);
    }
  }
  if (rest.length) {
    out.push(`OPEN (not yet late):`);
    for (const e of rest) out.push(line(db, e));
  }
  if (!open.length) out.push(`Nothing open. Log the next plan you give (rule 1).`);
  return out.join('\n');
}

function formatMatch(db, e, m, timesRaised) {
  const s = state(db, e);
  const out = [];
  out.push(`!! MATCH [${s.heat.toUpperCase()}] ${e.id} — "${e.title}" (matched: ${m.hits.join(', ')})`);
  const bits = [`planned ${e.created} (${s.age}d ago)`];
  if (isDate(e.due)) bits.push(`due ${e.due}`);
  if (s.overdue) bits.push(`${s.daysLate}d LATE`); else if (s.dueToday) bits.push('DUE TODAY'); else if (s.dueIn !== null) bits.push(`due in ${s.dueIn}d`);
  bits.push(`nagged ${s.nags}x`, `promises ${s.promises} (${s.brokenPromises} broken)`);
  out.push(`   ${bits.join(' · ')}`);
  if (e.plan) out.push(`   the plan was: ${e.plan}`);
  if (s.excuses.length) {
    for (const x of s.excuses.slice(-3)) out.push(`   ${x.date} ${db.config.owner} said: "${x.said}"${isDate(x.promisedBy) ? ` → promised ${x.promisedBy}` : ''}`);
  }
  if (e.notes) out.push(`   notes: ${e.notes}`);
  if (timesRaised > 0) {
    out.push(`   -> Already raised ${timesRaised}x this session. Do not repeat the speech. Hold the line: get the yes/no or the date, then log it (done / excuse / promise / drop) and run: ${CLI} nagged ${e.id}`);
  } else if (s.overdue) {
    out.push(`   -> This is the same task coming back, still not done. Confront BEFORE doing anything else (tone ladder in ${SKILL_REL}). Then run: ${CLI} nagged ${e.id}`);
  } else {
    out.push(`   -> Still open, not late yet. One line: it is open since ${e.created}, is it happening? Do not let it pass without a mention.`);
  }
  return out.join('\n');
}

// ---------- git sync across branches ----------
function repoRoot() {
  if (process.env.CLAUDE_PROJECT_DIR) return process.env.CLAUDE_PROJECT_DIR;
  try { return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: HERE, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch { return path.resolve(HERE, '..', '..', '..'); }
}
function git(args, opts = {}) {
  return execFileSync('git', args, {
    cwd: repoRoot(), stdio: ['ignore', 'pipe', 'ignore'], timeout: opts.timeout || 20000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  }).toString();
}
function sync({ quiet } = {}) {
  const log = (m) => { if (!quiet) process.stdout.write(m + '\n'); };
  let fetched = true;
  try { git(['fetch', '--quiet', '--prune', 'origin']); } catch { fetched = false; }
  let refs = [];
  try { refs = git(['for-each-ref', '--format=%(refname)', 'refs/remotes/origin/']).split('\n').filter(r => r && !r.endsWith('/HEAD')); } catch { /* not a git repo */ }
  const db = load();
  let added = 0, updated = 0;
  for (const ref of refs) {
    let remote;
    try { remote = JSON.parse(git(['show', `${ref}:${LEDGER_REL}`])); } catch { continue; }
    for (const e of (remote.entries || [])) {
      if (!e || !e.id) continue;
      const local = db.entries.find(x => x.id === e.id);
      if (!local) { db.entries.push(e); added++; }
      else if ((e.updated || '') > (local.updated || '')) { Object.assign(local, e); updated++; }
    }
  }
  if (added || updated) save(db);
  log(`sync: fetch ${fetched ? 'ok' : 'FAILED (offline? used local + cached refs)'}; ${refs.length} remote branches scanned; ${added} entries added, ${updated} updated from other branches.`);
  return { fetched, refs: refs.length, added, updated };
}

// ---------- commands ----------
const commands = {
  add({ pos, flags }) {
    const title = pos[0];
    if (!title) fail('usage: add "<title>" [--keywords a,b,c] [--due YYYY-MM-DD] [--plan "<one line>"] [--notes "<text>"] [--on YYYY-MM-DD] [--id <slug>]');
    if (flags.due && !isDate(flags.due)) fail(`--due must be YYYY-MM-DD, got "${flags.due}"`);
    if (flags.on && !isDate(flags.on)) fail(`--on must be YYYY-MM-DD, got "${flags.on}"`);
    const db = load();
    let id = flags.id || slugify(title);
    let n = 2; const base = id;
    while (db.entries.some(e => e.id === id)) id = `${base}-${n++}`;
    const e = {
      id, title, status: 'open',
      plan: flags.plan || '',
      keywords: String(flags.keywords || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
      created: flags.on || todayIn(db.config.timezone),
      due: flags.due || null,
      nags: 0, lastNag: null, excuses: [],
      notes: flags.notes || '',
      source: flags.source || '',
      updated: nowIso(),
    };
    db.entries.push(e); save(db);
    process.stdout.write(`added ${id} (due ${e.due || 'none → nag after ' + db.config.nagAfterDays + ' days'}). Commit ${LEDGER_REL} with your work.\n`);
  },
  list({ flags }) {
    const db = load();
    const rows = db.entries.filter(e => flags.all || e.status === 'open');
    if (!rows.length) { process.stdout.write('(nothing open)\n'); return; }
    for (const e of rows) process.stdout.write((e.status === 'open' ? line(db, e) : `- ${e.id} [${e.status.toUpperCase()} ${e.closedOn || ''}] ${e.title}`) + '\n');
  },
  show({ pos }) { const db = load(); process.stdout.write(JSON.stringify(find(db, pos[0]), null, 2) + '\n'); },
  check({ flags }) {
    const db = load();
    process.stdout.write(report(db, { rules: false }) + '\n');
    if (typeof flags.prompt === 'string') {
      const matches = findMatches(db, flags.prompt);
      process.stdout.write(matches.length ? matches.map(({ e, m }) => formatMatch(db, e, m, 0)).join('\n') + '\n' : `no match for prompt: "${flags.prompt}"\n`);
    }
  },
  nagged({ pos }) {
    const db = load(); const e = find(db, pos[0]);
    e.nags = (Number(e.nags) || 0) + 1; e.lastNag = todayIn(db.config.timezone); touch(e); save(db);
    process.stdout.write(`${e.id}: nagged ${e.nags}x (last ${e.lastNag}).\n`);
  },
  note({ pos }) {
    if (!pos[1]) fail('usage: note <id> "<verified fact>"');
    const db = load(); const e = find(db, pos[0]);
    const stamp = `${todayIn(db.config.timezone)}: ${pos[1]}`;
    e.notes = e.notes ? `${e.notes} | ${stamp}` : stamp; touch(e); save(db);
    process.stdout.write(`${e.id}: note added.\n`);
  },
  excuse({ pos }) {
    if (!pos[1]) fail('usage: excuse <id> "<what they said>"');
    const db = load(); const e = find(db, pos[0]);
    e.excuses = e.excuses || []; e.excuses.push({ date: todayIn(db.config.timezone), said: pos[1], promisedBy: null }); touch(e); save(db);
    process.stdout.write(`${e.id}: excuse #${e.excuses.length} recorded.\n`);
  },
  promise({ pos }) {
    if (!isDate(pos[1])) fail('usage: promise <id> <YYYY-MM-DD> ["<what they said>"]');
    const db = load(); const e = find(db, pos[0]);
    const today = todayIn(db.config.timezone);
    if (pos[1] < today) fail(`${pos[1]} is in the past; a promise needs a future date.`);
    e.excuses = e.excuses || [];
    e.excuses.push({ date: today, said: pos[2] || `promised to do it by ${pos[1]}`, promisedBy: pos[1], previousDue: e.due || null });
    e.due = pos[1]; touch(e); save(db);
    const moved = e.excuses.filter(x => isDate(x.promisedBy)).length;
    process.stdout.write(`${e.id}: due moved to ${pos[1]} (promise #${moved}). It gets FURIOUS the day after if still open.\n`);
  },
  done({ pos }) {
    const db = load(); const e = find(db, pos[0]);
    e.status = 'done'; e.closedOn = todayIn(db.config.timezone); if (pos[1]) e.doneNote = pos[1]; touch(e); save(db);
    process.stdout.write(`${e.id}: done on ${e.closedOn}${e.nags ? ` after ${e.nags} nag${e.nags > 1 ? 's' : ''}` : ''}. Commit ${LEDGER_REL}.\n`);
  },
  drop({ pos, flags }) {
    if (!flags.reason || flags.reason === true) fail('usage: drop <id> --reason "<why it no longer matters>"  (the user decides this, not you)');
    const db = load(); const e = find(db, pos[0]);
    e.status = 'dropped'; e.closedOn = todayIn(db.config.timezone); e.dropReason = flags.reason; touch(e); save(db);
    process.stdout.write(`${e.id}: dropped on ${e.closedOn} ("${flags.reason}"). Commit ${LEDGER_REL}.\n`);
  },
  sync() { sync({ quiet: false }); },
  hook() {
    let input = {};
    try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { input = {}; }
    const event = input.hook_event_name || (typeof input.prompt === 'string' ? 'UserPromptSubmit' : 'SessionStart');
    const sid = String(input.session_id || 'nosession').replace(/[^\w.-]/g, '');
    const marker = path.join(os.tmpdir(), `accountability-${sid}.json`);
    const seen = readJson(marker) || { reported: false, raised: {} };
    const remember = () => { try { fs.writeFileSync(marker, JSON.stringify(seen)); } catch { /* read-only tmp: fine */ } };
    const parts = [];
    if (event === 'SessionStart') {
      if (input.source !== 'compact') { try { sync({ quiet: true }); } catch { /* never block startup */ } }
      parts.push(report(load(), { rules: true }));
      seen.reported = true; remember();
    } else {
      const db = load();
      if (!seen.reported) { parts.push(report(db, { rules: true })); seen.reported = true; }
      for (const { e, m } of findMatches(db, input.prompt || '')) {
        const n = seen.raised[e.id] || 0;
        parts.push(formatMatch(db, e, m, n));
        seen.raised[e.id] = n + 1;
      }
      remember();
    }
    if (parts.length) process.stdout.write(parts.join('\n') + '\n');
  },
};

function findMatches(db, prompt) {
  return db.entries.filter(e => e.status === 'open')
    .map(e => ({ e, m: matchScore(e, prompt) }))
    .filter(x => x.m.score >= 2)
    .sort((a, b) => b.m.score - a.m.score);
}

// ---------- main ----------
const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'hook') {
  try { commands.hook(); } catch (err) { process.stderr.write(`accountability hook error (ignored): ${err && err.message}\n`); }
  process.exit(0);
}
if (!cmd || !commands[cmd]) {
  const usage = [];
  for (const l of fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n')) { if (l.startsWith('//')) usage.push(l.slice(3)); else if (usage.length) break; }
  process.stderr.write(usage.join('\n') + '\n');
  process.exit(cmd ? 1 : 0);
}
commands[cmd](parseArgs(rest));
