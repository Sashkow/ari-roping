// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makePhysics } from '../src/physics.js';
import { makeFlight } from '../src/flight.js';

const { physics } = JSON.parse(readFileSync(new URL('../data/constants.json', import.meta.url)));
const tuning = { reach_speed: 14, catch_absorb: 8, spin_damping_spread: 0.4, hoop_hold: 0.12, hoop_time: 0.2, hoop_cda: 0.02 };
const P = makePhysics({ ...physics, tuning }), F = makeFlight(P, physics, tuning);
const rad = (d) => (d * Math.PI) / 180, DT = 0.001;
const idle = { grip: false, poleRate: 0, spread: false, pitch: 0 }, pullIn = { ...idle, poleRate: -6 };
const launch = (l = 1.0) => F.release({ th: rad(60), om: 7.75, u: 16.6, x: 0 }, l, 0);
const run = (f, ctl, seconds) => { let got = null; for (let i = 0; i < seconds / DT && !got; i++) got = F.step(f, ctl, DT); return got; };

test('the hoop spins about 2.3 times faster than straight at the same pole length', () => {
  const f = launch(), w0 = F.spin(f);
  run(f, pullIn, 0.1); assert.equal(f.curl, 0, 'a tenth of a second of holding is not yet a hoop');
  run(f, pullIn, 0.4); assert.equal(f.curl, 1);
  const ratio = F.spin(f) / w0;
  assert.ok(Math.abs(ratio - F.inertia(1.0, 0) / F.inertia(1.0, 1)) < 1e-9 && ratio > 2.2 && ratio < 2.4, `ratio ${ratio.toFixed(2)}`);
  run(f, idle, 0.3); assert.equal(f.curl, 1, 'she stays curled when the key is let go');
});

test('reaching from the hoop opens her first: no pole movement until she is open, then the reach, then the catch', () => {
  const f = launch(); run(f, pullIn, 0.5); run(f, idle, 0.35);
  const reach = { ...idle, grip: true };
  run(f, reach, 0.15); assert.ok(f.curl > 0.05 && f.l === 1.0, `still opening after 0.15 s: curl ${f.curl.toFixed(2)}, poles ${f.l}`);
  const got = run(f, reach, 3);
  assert.ok(got, 'once open she should reach the wire and catch it'); assert.ok(f.curl < 0.05, 'she catches open');
});

test('letting the poles out from the hoop opens her first, and spreading too', () => {
  const f = launch(); run(f, pullIn, 0.5);
  run(f, { ...idle, poleRate: 6 }, 0.1); assert.equal(f.l, 1.0); run(f, { ...idle, poleRate: 6 }, 0.3); assert.ok(f.l > 1.5);
  const g = launch(); run(g, pullIn, 0.5);
  run(g, { ...idle, spread: true, pitch: rad(20) }, 0.1); assert.equal(g.spreadNow, false, 'curled, she cannot spread yet');
  run(g, { ...idle, spread: true, pitch: rad(20) }, 0.2); assert.equal(g.spreadNow, true);
});

test('poles a little above their shortest never curl, and reach at once', () => {
  const f = launch(1.2); run(f, idle, 0.5); assert.equal(f.curl, 0);
  const l0 = f.l; run(f, { ...idle, grip: true }, 0.02); assert.notEqual(f.l, l0, 'the reach should start immediately');
});

test('the hoop\'s drag does not depend on its attitude, a straight body\'s does', () => {
  const lost = (curl, phi) => { const f = { x: 0, y: 50, vx: 20, vy: 0, phi, L: 0, l: 1.0, curl, hold: 0 }; run(f, curl ? pullIn : idle, 0.5); return 20 - f.vx; };
  assert.ok(Math.abs(lost(1, 0) - lost(1, Math.PI / 2)) < 1e-9);
  assert.ok(lost(0, Math.PI / 2) > lost(0, 0) + 0.3);
});

test('grip held in the hoop: she picks the instant to open herself, and her poles come round onto the wire', () => {
  const tally = (auto) => {
    const t2 = { ...tuning, hoop_auto_open: auto }, P2 = makePhysics({ ...physics, tuning: t2 }), F2 = makeFlight(P2, physics, t2);
    let caught = 0, soft = 0, ahead = 0;
    for (let k = 0; k < 24; k++) {                              // the same high hop, grip pressed at 24 slightly different instants
      const f = F2.release({ th: rad(60), om: 7.75, u: 19, x: 0 }, 1.0, 0); f.vy += 2.5;
      let t = 0, got = null; const press = 0.75 + k * 0.0125;
      while (!got && t < 4 && f.y > -4) { got = F2.step(f, { grip: t >= press, poleRate: t < 0.45 ? -6 : 0, spread: false, pitch: 0 }, DT); t += DT; }
      if (got) { caught++; if (!got.hard) soft++; if (got.x > f.x) ahead++; }
    }
    return { caught, soft, ahead };
  };
  const byHand = tally(false), byHer = tally(true);
  console.log(`    opening at the press: ${JSON.stringify(byHand)}; opening when she chooses: ${JSON.stringify(byHer)}`);
  assert.equal(byHer.caught, 24);
  assert.ok(byHer.ahead >= 20 && byHer.ahead > byHand.ahead + 8, 'her tips should land ahead of her nearly every time');
  assert.ok(byHer.soft >= 16 && byHer.soft > byHand.soft, 'and mostly softly');
});
