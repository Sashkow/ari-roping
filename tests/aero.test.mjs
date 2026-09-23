// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makePhysics, MODE } from '../src/physics.js';

const { physics } = JSON.parse(readFileSync(new URL('../data/constants.json', import.meta.url)));
const P = makePhysics(physics);
const rad = (d) => (d * Math.PI) / 180;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test('spread at low pitch is exactly the simulations\' wing', () => {
  const a = P.attached(rad(65), 0, 22, 0, 2.4, 0, MODE.wing, rad(24.5));
  const b = P.attached(rad(65), 0, 22, 0, 2.4, 0, MODE.body, rad(24.5));
  near(a.lift, b.lift, 1e-9, 'lift'); near(a.drag, b.drag, 1e-9, 'drag');
});

test('spread at full pitch is exactly the simulations\' flare', () => {
  const a = P.attached(rad(-19), 0, 22, 0, 2.4, 0, MODE.flare, 1.0);
  const b = P.attached(rad(-19), 0, 22, 0, 2.4, 0, MODE.body, rad(90));
  near(a.drag, b.drag, 1e-9, 'drag'); near(b.lift, 0, 1e-9, 'lift');
});

test('flare at 22 m/s drags her at 2.2 to 2.5 times her weight', () => {
  const b = P.attached(rad(-19), 0, 22, 0, 2.4, 0, MODE.body, rad(90));
  assert.ok(b.drag / P.W > 2.2 && b.drag / P.W < 2.6, `drag ${(b.drag / P.W).toFixed(2)} g`);
});

test('lifted gait: about 140 % lift, poles in compression, tips press up', () => {
  const b = P.attached(rad(65), 0, 22, 0, 2.4, 0, MODE.body, rad(24.5));
  near((100 * b.lift) / P.W, 140, 3, 'lift share');
  assert.ok(b.tension < 0, 'poles should push'); assert.ok(b.wireUp > 0, 'tips should press up');
});
