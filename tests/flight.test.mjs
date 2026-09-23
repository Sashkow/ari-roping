// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makePhysics, MODE } from '../src/physics.js';
import { makeFlight } from '../src/flight.js';
import { makeClock } from '../src/loop.js';

const { physics } = JSON.parse(readFileSync(new URL('../data/constants.json', import.meta.url)));
const tuning = { reach_speed: 14, catch_absorb: 8, spin_damping_spread: 0.4, blendFromDeg: 35, blendToDeg: 70 };
const P = makePhysics({ ...physics, tuning }), F = makeFlight(P, physics, tuning);
const rad = (d) => (d * Math.PI) / 180, DT = 0.001;
const idle = { grip: false, poleRate: 0, spread: false, pitch: 0 };

// the brake-and-pull release of the solved run: poles 60 deg ahead, 1.0 m, tips at 16.6 m/s, leaving at (20.4, 6.7) m/s
const launch = () => F.release({ th: rad(60), om: 7.75, u: 16.6, x: 0 }, 1.0, 0);

test('release hands over head position, velocity and the swing rate', () => {
  const f = launch();
  assert.ok(Math.abs(f.x - Math.sin(rad(60))) < 1e-9 && Math.abs(f.y + 0.5) < 1e-9);
  assert.ok(Math.abs(F.spin(f) - 7.75) < 1e-9);
  assert.ok(Math.abs(f.vx - 20.4) < 0.2 && Math.abs(f.vy - 6.7) < 0.1, `velocity (${f.vx.toFixed(1)}, ${f.vy.toFixed(1)})`);
});

test('letting the poles out slows the spin by the ratio of the moments of inertia', () => {
  const f = launch(), w0 = F.spin(f);
  for (let i = 0; i < 400; i++) F.step(f, { ...idle, poleRate: 6 }, DT);
  assert.equal(f.l, 2.4);
  const ratio = F.spin(f) / w0, want = F.inertia(1.0) / F.inertia(2.4);
  assert.ok(Math.abs(ratio - want) < 1e-6, `${ratio} vs ${want}`);
  assert.ok(ratio < 0.4 && ratio > 0.25, `to about a third: ${ratio.toFixed(2)}`);
});

test('reach and catch: attached with no jump in her head position, tips at her horizontal speed', () => {
  const f = launch();
  let got = null, t = 0;
  while (!got && t < 4) { got = F.step(f, { ...idle, grip: f.vy < 0 }, DT); t += DT; }
  assert.ok(got, 'she never caught the wire');
  const hx = got.x + got.l * Math.sin(got.th), hy = -got.l * Math.cos(got.th);
  assert.ok(Math.hypot(hx - f.x, hy - f.y) < 1e-6, 'head position jumped at the catch');
  assert.ok(Math.abs(got.u - f.vx) < 1e-9 && got.l >= F.L_MIN && got.l <= F.L_MAX);
  assert.ok(f.x > 12, `she should have flown well over ten metres, flew ${f.x.toFixed(1)}`);
});

test('sweep catch: poles pointing away run to full length and her roll brings a tip onto the wire', () => {
  const f = { x: 0, y: 1.0, vx: 15, vy: 3, phi: rad(80), L: 0, l: 1.0 };           // poles point up, away from the wire
  f.L = F.inertia(1.0) * 6;                                                          // rolling at about a turn a second
  let got = null, t = 0, sawFull = false;
  while (!got && t < 3) { got = F.step(f, { ...idle, grip: true }, DT); sawFull ||= f.l === 2.4; t += DT; }
  assert.ok(sawFull, 'poles should have run to full length first');
  assert.ok(got, 'her roll should have swept a tip across the wire plane');
});

test('cancelled reach: nothing attaches and the poles keep the length they reached', () => {
  const f = { x: 0, y: 3.0, vx: 15, vy: 0, phi: rad(-90), L: 0, l: 1.0 };           // wire 3 m below, out of reach
  for (let i = 0; i < 50; i++) assert.equal(F.step(f, { ...idle, grip: true }, DT), null);
  const l = f.l;
  assert.ok(l > 1.5 && l < 2.0, `reached ${l.toFixed(2)} m in 50 ms`);
  for (let i = 0; i < 50; i++) assert.equal(F.step(f, idle, DT), null);
  assert.equal(f.l, l);
});

test('spread in the air she glides, no better than about 2.5 to 1, and her spin dies away', () => {
  const f = { x: 0, y: 40, vx: 22, vy: 0, phi: rad(180), L: F.inertia(2.4) * 3, l: 2.4 };
  let best = 0;
  for (const pitch of [8, 12, 16, 20]) {
    const g = { ...f };
    for (let i = 0; i < 1500; i++) F.step(g, { ...idle, spread: true, pitch: rad(pitch) }, DT);
    const x0 = g.x, y0 = g.y;
    for (let i = 0; i < 1500; i++) F.step(g, { ...idle, spread: true, pitch: rad(pitch) }, DT);
    best = Math.max(best, (g.x - x0) / (y0 - g.y));
    assert.ok(Math.abs(F.spin(g)) < 0.01, 'spin should be gone after 3 s spread');
  }
  assert.ok(best > 1.2 && best < 2.7, `best glide ratio ${best.toFixed(2)}`);
});

test('grip limit: a brake beyond it is clamped, the default limit never acts', () => {
  const args = [rad(30), 1.0, 20, -40, 2.4, 0, MODE.narrow, 0];
  const free = P.limitTipAccel(...args, 1e9), capped = P.limitTipAccel(...args, 30);
  assert.deepEqual(free, { aP: -40, saturated: false });
  assert.ok(capped.saturated && capped.aP > -40, `clamped to ${capped.aP.toFixed(1)} m/s2`);
  const out = P.attached(rad(30), 1.0, 20, capped.aP, 2.4, 0, MODE.narrow, 0);
  assert.ok(Math.abs(Math.abs(out.wireX) - 30) < 1e-6, `force along the wire ${out.wireX.toFixed(1)} N`);
});

test('fixed step: 30 and 60 frames per second give the identical trajectory', () => {
  const fly = (fps) => {
    const st = { th: rad(-19.3), om: 0, u: 22, x: 0 }, clock = makeClock(DT);
    const brake = (t) => (t >= 0.2 && t < 0.7 ? -7 : 0);                              // inputs are read by simulation time
    for (let frame = 0; frame < fps * 1.5; frame++) clock.advance(1 / fps, (t) => P.stepAttached(st, { aP: brake(t), l: 2.4, dl: 0, mode: MODE.narrow, level: 0 }, DT));
    return { st, steps: clock.steps };
  };
  const a = fly(30), b = fly(60);
  assert.ok(Math.abs(a.steps - b.steps) <= 1, `${a.steps} vs ${b.steps} steps`);
  const n = Math.min(a.steps, b.steps), again = (fps) => { const st = { th: rad(-19.3), om: 0, u: 22, x: 0 }; for (let i = 0; i < n; i++) P.stepAttached(st, { aP: i * DT >= 0.2 && i * DT < 0.7 ? -7 : 0, l: 2.4, dl: 0, mode: MODE.narrow, level: 0 }, DT); return st; };
  assert.deepEqual(again(30), again(60));
  if (a.steps === b.steps) assert.deepEqual(a.st, b.st);
});
