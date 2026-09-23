// Demos first (section 12): every demo in data/demos.json replays from its plan to the same tokens at the same
// times (the page marks the moments from that list), and the page boots in demo mode, stops at the first moment
// and steps between moments.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { makeGame } from '../src/game.js';
import { makeCommands } from '../src/input.js';
import { makeTokens } from '../src/tokens.js';
import { demos, freshState } from '../src/demos.js';

const { physics } = JSON.parse(readFileSync(new URL('../data/constants.json', import.meta.url)));
const level = JSON.parse(execFileSync(process.env.PYTHON || '/opt/ro/venv/bin/python', ['-c',
  'import json,yaml,sys; print(json.dumps(yaml.safe_load(open(sys.argv[1]))))', new URL('../levels/base.yaml', import.meta.url).pathname]));
const file = new URL('../data/demos.json', import.meta.url), recorded = existsSync(file) ? JSON.parse(readFileSync(file)) : {};

test('every recorded demo replays to the same tokens at the same times', { skip: !Object.keys(recorded).length && 'no data/demos.json: run node tools/demo.mjs' }, () => {
  for (const [id, d] of Object.entries(recorded)) {
    const g = makeGame(physics, level, { gait: d.start === 'lifted' ? 'lifted' : 'pulled' }), cmds = makeCommands({ ...level.input, balance: level.balance }), dt = level.tuning.step, tk = makeTokens(g, level), st = freshState(), toks = [];
    if (d.start === 'lifted') cmds.state.wingOn = true;
    while (!g.over && g.t < 14) { const cmd = cmds.update(demos[id].plan(g, d.params, st), dt); g.step(cmd, dt); if (g.won && g.over) { g.over = null; g.passedAt = Infinity; } if (g.events.includes('arc')) cmds.cancelSpread(); toks.push(...tk.step(cmd)); }
    assert.deepEqual(toks.map((k) => [k.t, k.name]), d.tokens.map((k) => [k.t, k.name]), `${id}: the replay should reproduce the recorded moments`);
  }
});

test('the closing demos close and the others say how close they came', { skip: !Object.keys(recorded).length && 'no data/demos.json' }, () => {
  const closing = Object.values(recorded).filter((d) => d.closes).length;
  console.log(`    ${closing} of ${Object.keys(recorded).length} demos close: ${Object.entries(recorded).filter(([, d]) => d.closes).map(([id]) => id).join(', ')}`);
  for (const [id, d] of Object.entries(recorded)) if (!d.closes) assert.ok(Object.keys(d.numbers).length, `${id} does not close and should say by how much`);
});

test('the page in demo mode: plays through by default; with stops on it stops at the first moment, . steps to the next, R restarts', { skip: !recorded.swoop && 'no swoop demo' }, async () => {
  const handlers = {}, els = {}, noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'createLinearGradient' ? () => ({ addColorStop: noop }) : k in t ? t[k] : noop), set: (t, k, v) => ((t[k] = v), true) });
  const el = (id) => (els[id] ??= { id, hidden: false, textContent: '', children: [], className: '', getContext: () => ctx, getBoundingClientRect: () => ({ width: 1000, height: 450 }),
    on: {}, addEventListener(t, f) { this.on[t] = f; }, focus: noop, style: {}, querySelector: () => null, append(...c) { this.children.push(...c); }, replaceChildren(...c) { this.children = c; } });
  const doc = { getElementById: el, createElement: () => el('x' + Math.random()), documentElement: {}, addEventListener: (t, f) => (handlers[t] = f) };
  let raf = null, now = performance.now();
  Object.assign(globalThis, { document: doc, window: { devicePixelRatio: 1, addEventListener: noop }, location: { hash: '#demo=swoop&speed=1' }, requestAnimationFrame: (f) => (raf = f),
    ResizeObserver: class { observe() {} }, navigator: { getGamepads: () => [] }, localStorage: { getItem: () => null, setItem: noop }, matchMedia: () => ({ addEventListener: noop }), getComputedStyle: () => ({ getPropertyValue: () => '#123456' }) });
  const { boot } = await import('../src/main.js');
  const page = boot({ physics, levels: [level], ghosts: {}, demos: recorded }, doc);
  const frames = (s) => { for (let i = 0; i < s * 60; i++) { now += 1000 / 60; const f = raf; raf = null; f(now); } };
  assert.ok(els.title.textContent.startsWith('Demo: Swoop'));
  const first = recorded.swoop.tokens.find((k) => k.name !== 'BACK');
  frames(first.t + 1.0);
  assert.ok(!page.paused(), 'by default the demo plays through its key moments (2026-09-23)');
  assert.ok(page.game().t > first.t + 0.5, `ran on past the first moment at ${first.t}`);
  els.stopAt.on.change({ target: { checked: true } }); handlers.keydown({ key: 'r', preventDefault: noop }); frames(first.t + 1.0);
  assert.ok(page.paused(), 'with stops on, playback should have stopped at the first key moment');
  assert.ok(Math.abs(page.game().t - first.t) < 0.02, `held at ${page.game().t.toFixed(3)} s, the first moment is at ${first.t}`);
  handlers.keydown({ key: '.', preventDefault: noop }); frames(0.1);
  const second = recorded.swoop.tokens.filter((k) => k.name !== 'BACK')[1];
  assert.ok(Math.abs(page.game().t - second.t) < 0.02, '. should step to the second moment');
  handlers.keydown({ key: 'r', preventDefault: noop }); frames(0.1);
  assert.ok(page.game().t < 0.2 && !page.paused(), 'R should restart and play');
});
