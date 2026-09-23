// Smoke test of the page wiring without a browser: a stub DOM, real key events, real frames.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const { physics } = JSON.parse(readFileSync(new URL('../data/constants.json', import.meta.url)));
const level = JSON.parse(execFileSync(process.env.PYTHON || '/opt/ro/venv/bin/python', ['-c',
  'import json,yaml,sys; print(json.dumps(yaml.safe_load(open(sys.argv[1]))))', new URL('../levels/base.yaml', import.meta.url).pathname]));

function stubBrowser() {
  const handlers = {}, els = {}, noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'createLinearGradient' ? () => ({ addColorStop: noop }) : k in t ? t[k] : noop), set: (t, k, v) => ((t[k] = v), true) });
  const el = (id) => (els[id] ??= { id, hidden: false, textContent: '', children: [], getContext: () => ctx, getBoundingClientRect: () => ({ width: 1000, height: 450 }),
    addEventListener: noop, focus: noop, style: {}, querySelector: () => null, append(...c) { this.children.push(...c); }, replaceChildren(...c) { this.children = c; } });
  const doc = { getElementById: el, createElement: () => el('x' + Math.random()), documentElement: {}, addEventListener: (t, f) => (handlers[t] = f) };
  let raf = null, now = performance.now();
  Object.assign(globalThis, { document: doc, window: { devicePixelRatio: 1, addEventListener: noop }, location: { hash: '#speed=1' }, requestAnimationFrame: (f) => (raf = f),
    ResizeObserver: class { observe() {} }, navigator: { getGamepads: () => globalThis.__pads || [] }, localStorage: { getItem: () => null, setItem: noop }, matchMedia: () => ({ addEventListener: noop }), getComputedStyle: () => ({ getPropertyValue: () => '#123456' }) });
  const key = (type, k) => handlers[type]({ key: k, preventDefault: noop });
  const frames = (seconds) => { for (let i = 0; i < seconds * 60; i++) { now += 1000 / 60; const f = raf; raf = null; f(now); } };
  return { doc, key, frames, els };
}

test('keys reach the game: brake slows her tips, Space lets go, holding Space in the air reaches and catches', async () => {
  const b = stubBrowser();
  const { boot } = await import('../src/main.js');
  const page = boot({ physics, levels: [level], ghosts: {} }, b.doc);
  b.frames(0.5);
  assert.ok(Math.abs(page.game().st.u - 22) < 0.01 && page.game().t > 0.45, 'half a second of cruise should have run');
  b.key('keydown', 'ArrowLeft'); b.frames(1.0); b.key('keyup', 'ArrowLeft');
  const u = page.game().st.u;
  assert.ok(u < 15 && u > 8, `a second of braking should take her tips from 79 to about 45 km/h, got ${(u * 3.6).toFixed(0)}`);
  assert.ok(page.game().st.th > 0, 'braking should have swung her forward');
  b.key('keydown', ' '); b.frames(0.05); b.key('keyup', ' ');
  assert.equal(page.game().mode, 'air');
  b.key('keydown', 'r'); b.frames(0.1);
  assert.equal(page.game().mode, 'wire'); assert.ok(page.game().t < 0.2, 'R should restart the run');
  assert.ok(b.els.readout.children.length >= 10, 'readouts should be filled');
  // [ and ] change how fast the game is played; the default comes from the level
  assert.equal(page.scale(), 1); b.key('keydown', '['); assert.equal(page.scale(), 0.75); b.key('keydown', '[');
  const t0 = page.game().t; b.frames(1.0);
  assert.ok(Math.abs(page.game().t - t0 - 0.5) < 0.03, `at 0.5x one real second should be half a game second, was ${(page.game().t - t0).toFixed(2)}`);
  b.key('keydown', ']'); b.key('keydown', ']');
  assert.equal(page.scale(), 1);
  // a radio on USB: right stick pushed left brakes her tips, with no key pressed
  b.key('keydown', 'r'); b.frames(0.2);
  globalThis.__pads = [{ id: 'Radiomaster TX12 Joystick', axes: [-1, 0, -1, 0, 0, 0, 0, 0], buttons: Array.from({ length: 24 }, () => ({ pressed: false, value: 0 })) }];
  b.frames(0.5);
  assert.ok(page.game().st.u < 22 - 5, `half a second of full brake from the radio should slow her tips, got ${(page.game().st.u * 3.6).toFixed(0)} km/h`);
  globalThis.__pads = []; b.key('keydown', 'r'); b.frames(0.1);
  // B switches the trolleybus off: she can ride straight through where it was, and nothing ends the run
  b.key('keydown', 'b'); assert.equal(page.game().world.bus.on, false);
  b.frames(4.0);
  assert.equal(page.game().over, null, 'with the bus off nothing should end the run'); assert.ok(page.game().st.x > 80, 'she should have ridden past where the bus was');
  b.key('keydown', 'b'); assert.equal(page.game().world.bus.on, true);
  const gap = page.game().world.geom().shoes - page.game().tips()[0];
  assert.ok(Math.abs(gap - 60) < 0.5, `back on, the bus should be 60 m ahead of her, is ${gap.toFixed(1)}`);
});
