// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { humHz, humGain, CHOPPER_HZ } from '../src/sound.js';

test('the hum follows speed: the bus at ~190 Hz at cruise, her tips two octaves up, both silent at rest', () => {
  assert.ok(Math.abs(humHz(22, 'bus') - 190) < 1e-9);
  assert.ok(Math.abs(humHz(22, 'ari') - 733.3) < 0.1, `ari ${humHz(22, 'ari')}`);
  assert.ok(humHz(22, 'ari') / humHz(22, 'bus') > 3.5 && humHz(22, 'ari') / humHz(22, 'bus') < 4.2);
  assert.equal(humHz(0, 'ari'), 0);
});

test('loudness follows the coil force, the jaws add a little, and her tips are about 25 dB below the bus', () => {
  assert.ok(humGain(40, 0, 40, 'bus') > humGain(10, 0, 40, 'bus'));
  assert.ok(humGain(40, 100, 40, 'bus') > humGain(40, 0, 40, 'bus'));
  const ratio = humGain(40, 0, 40, 'ari') / humGain(40, 0, 40, 'bus');
  assert.ok(20 * Math.log10(ratio) < -20 && 20 * Math.log10(ratio) > -30, `${(20 * Math.log10(ratio)).toFixed(1)} dB`);
  assert.equal(CHOPPER_HZ, 900);
});
