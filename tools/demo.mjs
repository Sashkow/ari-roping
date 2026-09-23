// SPDX-License-Identifier: GPL-3.0-or-later
// Demos first (task 12.1): run every candidate of src/demos.js through the physics core, searching its small
// parameter grid for the first combination that closes, and write for each a tab (out/demos/<id>.tab), the
// numbers, and the tokens the page needs to mark the key moments (data/demos.json, embedded by build.py).
// Run: node tools/demo.mjs [id ...]   then: make build, open dist/roping-ari.html#demo=<id>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { makeGame } from '../src/game.js';
import { makeCommands } from '../src/input.js';
import { makeTokens, tokenLine } from '../src/tokens.js';
import { demos, grid, freshState } from '../src/demos.js';
import { rad } from '../src/util.js';

const ROOT = new URL('../', import.meta.url);
const constants = JSON.parse(readFileSync(new URL('data/constants.json', ROOT)));
const level = JSON.parse(execFileSync(process.env.PYTHON || '/opt/ro/venv/bin/python', ['-c',
  'import json,yaml,sys; print(json.dumps(yaml.safe_load(open(sys.argv[1]))))', new URL('levels/base.yaml', ROOT).pathname]));
const T_MAX = 14;

/** One run of a candidate with one parameter set: tokens, a per-step trace, the input lines of the tab. */
export function run(cand, p) {
  const g = makeGame(constants.physics, level, { gait: cand.start === 'lifted' ? 'lifted' : 'pulled' });
  const cmds = makeCommands({ ...level.input, balance: level.balance }), dt = level.tuning.step, tokens = makeTokens(g, level), st = freshState();
  if (cand.start === 'lifted') cmds.state.wingOn = true;
  const engage = rad(level.balance.engage_deg), toks = [], trace = [], inputs = [];
  let prevKeys = {}, cmd = cmds.update({}, dt);
  while (!g.over && g.t < T_MAX) {
    const keys = cand.plan(g, p, st) || {};
    for (const k of new Set([...Object.keys(prevKeys), ...Object.keys(keys)])) if (!!keys[k] !== !!prevKeys[k]) inputs.push(`${g.t.toFixed(3)}  ${k} ${keys[k] ? 'on' : 'off'}`);
    prevKeys = { ...keys };
    cmd = cmds.update(keys, dt); g.step(cmd, dt);
    if (g.won && g.over) { g.over = null; g.passedAt = Infinity; }              // a demo runs on past the win: the shape may come after the pass
    if (g.events.includes('arc')) cmds.cancelSpread();
    toks.push(...tokens.step(cmd));
    const [hx, hy] = g.head(), [, vy] = g.velocity(), o = g.out, geo = g.world.geom();
    const liftShare = g.mode === 'wire' && o ? o.lift / g.P.W : 0, spread = !!(g.shown || cmd).spread && !g.arcing();
    trace.push({ t: g.t, dt, mode: g.mode, spread, vy, l: g.poleLength(), tension: o ? o.tension : 0, liftShare, curl: g.fl ? g.fl.curl || 0 : 0,
                 lifted: g.mode === 'wire' && spread && g.st.th > engage && liftShare > 0.6, overBus: g.world.bus.on && hx > geo.rear && hx < geo.front && hy > g.world.roofY,
                 catchAlong: g.catchAlong != null && trace.length && trace[trace.length - 1].mode === 'air' && g.mode === 'wire' ? g.catchAlong : null });
  }
  return { g, toks, trace, inputs };
}

function tab(id, cand, p, r) {
  const g = r.g, head = g.head(), hash = createHash('sha256').update(JSON.stringify([g.t, head, g.mode, g.st, g.l])).digest('hex').slice(0, 8);
  return [`roping tab 1`, `demo ${id}  constants ${constants.source_sha256.slice(0, 8)}  level ${level.name}  bus ${(level.bus.speed * 3.6).toFixed(0)} km/h  wind ${level.wind}  input plan ${JSON.stringify(p)}`,
          ...r.inputs, ...r.toks.map(tokenLine), `end ${g.t.toFixed(3)}  x ${head[0].toFixed(2)}  y ${head[1].toFixed(2)}  hash ${hash}  ${g.over || 'time up'}`].join('\n') + '\n';
}

const want = process.argv.slice(2), ids = want.length ? want : Object.keys(demos), results = {};
mkdirSync(new URL('out/demos/', ROOT), { recursive: true });
for (const id of ids) {
  const cand = demos[id]; if (!cand) { console.error(`no demo ${id}`); continue; }
  let best = null;                                   // the whole grid: the closing set with the best score, else the nearest miss
  for (const p of grid(cand.params)) {
    const r = run(cand, p), c = cand.closes(r.toks, r.g, r.trace), rank = (c.ok ? 1e6 : 0) + (c.score ?? 0);
    if (!best || rank > best.rank) best = { p, r, c, rank };
  }
  const { p, r, c } = best, nums = Object.fromEntries(Object.entries(c).filter(([k]) => !['ok', 'note', 'score'].includes(k)));
  results[id] = { title: cand.title, kind: cand.kind, what: cand.what, start: cand.start || 'pulled', params: p, closes: c.ok, numbers: nums, note: c.note || '', ended: r.g.over || 'time up',
                  tokens: r.toks.map((k) => ({ ...k })) };
  writeFileSync(new URL(`out/demos/${id}.tab`, ROOT), tab(id, cand, p, r));
  console.log(`${c.ok ? 'closes      ' : 'does not close'}  ${id.padEnd(18)} ${JSON.stringify(nums)}  ${c.note || ''}`);
}
if (!want.length) writeFileSync(new URL('data/demos.json', ROOT), JSON.stringify(results, null, 1));
const rows = Object.entries(results).map(([id, d]) => `| ${d.title} | ${d.kind} | ${d.what} | ${d.closes ? '**closes**' : 'does not close'} | ${Object.entries(d.numbers).map(([k, v]) => `${k} ${v}`).join(', ')} | \`#demo=${id}\` |`);
writeFileSync(new URL('out/demos/index.md', ROOT), `# Demos (task 12.4), ${new Date().toISOString().slice(0, 10)}\n\nOpen \`dist/roping-ari.html\` with the hash in the last column. Picks go in the tasks file.\n\n| candidate | kind | shape | result | numbers | page |\n|---|---|---|---|---|---|\n${rows.join('\n')}\n`);
