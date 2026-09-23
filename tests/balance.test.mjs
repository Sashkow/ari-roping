import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { makeGame } from '../src/game.js';

const { physics } = JSON.parse(readFileSync(new URL('../data/constants.json', import.meta.url)));
const level = JSON.parse(execFileSync(process.env.PYTHON || '/opt/ro/venv/bin/python', ['-c',
  'import json,yaml,sys; print(json.dumps(yaml.safe_load(open(sys.argv[1]))))', new URL('../levels/base.yaml', import.meta.url).pathname]));
const rad = (d) => (d * Math.PI) / 180, deg = (r) => (r * 180) / Math.PI, dt = level.tuning.step;
const wing = (pitchDeg) => ({ accel: 0, poleRate: 0, grip: false, gripPressed: false, spread: true, flare: false, pitch: rad(pitchDeg), lead: rad(65), slow: false });
const fly = (assist, seconds, nudgeDeg = 3) => {
  const g = makeGame(physics, level, { gait: 'lifted' }); g.world.setBus(false); g.assistOn = assist; g.st.th += rad(nudgeDeg);
  let worst = 0;
  for (let i = 0; i < seconds / dt && !g.over; i++) { g.step(wing(24.5), dt); if (i * dt > 2) worst = Math.max(worst, Math.abs(deg(g.st.th) - 65)); }
  return { g, worst };
};

test('balance assist holds the lifted gait: nudged 3 degrees, she is back within 2 degrees of the lead and stays', () => {
  const { g, worst } = fly(true, 10);
  assert.equal(g.over, null);
  assert.ok(worst < 2, `after 2 s she should stay within 2 deg of 65, worst ${worst.toFixed(2)}`);
  assert.ok(g.out.lift / g.P.W > 1.3 && g.out.tension < 0, 'flying on her own lift, poles pushing');
});

test('no assist, no balance: with the same fixed pitch the same nudge grows and she drops out of the gait', () => {
  const { g } = fly(false, 8);
  assert.ok(Math.abs(deg(g.st.th) - 65) > 20 || g.over, `she should have left the lead angle, is at ${deg(g.st.th).toFixed(0)}`);
});

test('too slow to fly: at 50 km/h the assist says so instead of pretending', () => {
  const g = makeGame(physics, level, { gait: 'lifted' }); g.world.setBus(false); g.st.u = 14;
  g.step(wing(24.5), dt);
  assert.deepEqual([g.balance.ok], [false]);
});
