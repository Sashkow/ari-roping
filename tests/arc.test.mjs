import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { makeGame } from '../src/game.js';

const { physics } = JSON.parse(readFileSync(new URL('../data/constants.json', import.meta.url)));
const level = JSON.parse(execFileSync(process.env.PYTHON || '/opt/ro/venv/bin/python', ['-c',
  'import json,yaml,sys; print(json.dumps(yaml.safe_load(open(sys.argv[1]))))', new URL('../levels/base.yaml', import.meta.url).pathname]));
const rad = (d) => (d * Math.PI) / 180, dt = level.tuning.step;
const spread = { accel: 0, poleRate: 0, grip: false, gripPressed: false, spread: true, pitch: rad(20), slow: false };

test('spread between the wires: an arc strikes, the run goes on, and she cannot flare or fly for 3 s', () => {
  const g = makeGame(physics, level);
  g.world.setBus(false);
  g.mode = 'air'; g.fl = { x: 0, y: 0.05, vx: 18, vy: -3, phi: rad(170), L: 0, l: 2.4 };      // just above the wires, sinking, spread
  g.step(spread, dt); for (let i = 0; i < 40 && !g.arcing(); i++) g.step(spread, dt);
  assert.ok(g.arcing(), 'crossing the wire plane spread should strike an arc');
  assert.equal(g.over, null, 'the arc does not end the run');
  assert.equal(g.arcs, 1);
  const t0 = g.t;
  // while it burns, a spread command does nothing: she falls like a narrow body, with no lift
  const vy0 = g.fl.vy; for (let i = 0; i < 200; i++) g.step(spread, dt);
  assert.ok(g.fl.vy < vy0 - 0.2 * 9.81 * 0.95, `no lift while the arc burns: vy went ${vy0.toFixed(2)} -> ${g.fl.vy.toFixed(2)}`);
  assert.ok(Math.abs(g.arcUntil - (t0 + level.tuning.arc_seconds)) < 0.05);
});

test('after the arc she can spread again, and it lifts', () => {
  const g = makeGame(physics, level);
  g.world.setBus(false);
  g.mode = 'air'; g.fl = { x: 0, y: 30, vx: 22, vy: 0, phi: rad(180), L: 0, l: 2.4 };
  g.arcUntil = 0.5;
  for (let i = 0; i < 500; i++) g.step(spread, dt);
  const vyArc = g.fl.vy;                                   // half a second of free fall
  assert.ok(vyArc < -4.5, `narrow while arcing: ${vyArc.toFixed(2)}`);
  for (let i = 0; i < 500; i++) g.step(spread, dt);
  assert.ok(g.fl.vy > vyArc - 2.5, `spread again after the arc, the wing carries part of her: ${g.fl.vy.toFixed(2)}`);
});
