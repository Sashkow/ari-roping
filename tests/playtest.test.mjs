// SPDX-License-Identifier: GPL-3.0-or-later
// The control scenarios of the spec, played through the real command layer with scripted keys.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { makeGame } from '../src/game.js';
import { makeCommands } from '../src/input.js';
import { autopilots } from '../src/autopilot.js';

const { physics } = JSON.parse(readFileSync(new URL('../data/constants.json', import.meta.url)));
const level = JSON.parse(execFileSync(process.env.PYTHON || '/opt/ro/venv/bin/python', ['-c',
  'import json,yaml,sys; print(json.dumps(yaml.safe_load(open(sys.argv[1]))))', new URL('../levels/base.yaml', import.meta.url).pathname]));

test('brake and pull, by keys: she clears the 3 m/s bus and is back on the wire ahead of it', () => {
  const g = makeGame(physics, level), cmds = makeCommands(level.input), dt = level.tuning.step;
  let released = null;
  while (!g.over && g.t < 30) {
    g.step(cmds.update(autopilots.brakeAndPull(g), dt), dt);
    if (g.mode === 'air' && !released) released = { v: g.velocity(), u: g.st.u };
  }
  console.log(`    left the wire at (${released.v[0].toFixed(1)}, ${released.v[1].toFixed(1)}) m/s with tips at ${released.u.toFixed(1)} m/s; apex ${g.apex.toFixed(1)} m; ` +
              `${g.turns.toFixed(2)} turns; ${g.over} t=${g.t.toFixed(1)} s, tips ${g.st.u.toFixed(1)} m/s`);
  assert.ok(g.won, `run ended with: ${g.over}`);
  assert.ok(released.v[0] > 17, 'she should leave the wire at well over 60 km/h forward');
});

test('the watch mode\'s run, by keys: brake, pull, hoop over the bus, grip held so she times the opening herself, caught ahead of it', () => {
  const g = makeGame(physics, level), cmds = makeCommands({ ...level.input, balance: level.balance }), dt = level.tuning.step;
  let hoop = 0, waited = 0;
  while (!g.over && g.t < 30) { g.step(cmds.update(autopilots.brakePullHoop(g), dt), dt); if (g.mode === 'air') { if (g.fl.curl > 0.95) hoop += dt; if (g.fl.waiting) waited += dt; } }
  console.log(`    hoop for ${hoop.toFixed(2)} s, ${Math.abs(g.turns).toFixed(1)} turns, waited ${waited.toFixed(2)} s for the instant to open, apex ${g.apex.toFixed(1)} m; ${g.over}`);
  assert.ok(g.won, `run ended with: ${g.over}`);
  assert.ok(hoop > 0.5 && Math.abs(g.turns) > 3, 'she should have rolled over the bus as a hoop, several turns');
});

test('one press of grip in the air is enough: she reaches until she has the wire; a second press calls it off', () => {
  const fly = (secondPress) => {
    const g = makeGame(physics, level), cmds = makeCommands({ ...level.input, balance: level.balance }), dt = level.tuning.step;
    g.world.setBus(false);
    let tapped = 0, tapUntil = -1, lengthAtCancel = null;
    while (!g.over && g.t < 12 && !(g.mode === 'wire' && g.catches > 0)) {
      const k = autopilots.brakeAndPull(g); delete k.grip;
      if (g.mode === 'wire' && g.st.th >= 58 * Math.PI / 180 && tapped === 0) { tapped = 1; tapUntil = g.t + 0.03; }            // let go
      if (g.mode === 'air' && tapped === 1 && g.fl.vy < 0 && g.t > tapUntil + 0.2) { tapped = 2; tapUntil = g.t + 0.03; }           // one short tap: reach
      if (secondPress && tapped === 2 && g.reaching && g.t > tapUntil + 0.05) { tapped = 3; tapUntil = g.t + 0.03; }                // another: call it off
      if (g.t <= tapUntil) k.grip = true;
      g.step(cmds.update(k, dt), dt);
      if (tapped === 3 && lengthAtCancel === null && !g.reaching && g.mode === 'air') lengthAtCancel = g.fl.l;
    }
    return { g, lengthAtCancel };
  };
  const a = fly(false);
  assert.ok(a.g.mode === 'wire' && a.g.catches === 1, `one 30 ms tap should have been enough to catch the wire, ended: ${a.g.over || a.g.mode}`);
  const b = fly(true);
  assert.equal(b.g.catches, 0, 'the second press should have called the reach off');
  assert.ok(b.lengthAtCancel !== null);
});
