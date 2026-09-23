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

test('her pitch carries the slip: up when the coils push, down when they brake, and she sings pushing from a stand', () => {
  assert.ok(Math.abs(humHz(22, 'ari', 40, 40) - 833.3) < 0.1, 'full push at cruise');
  assert.ok(Math.abs(humHz(22, 'ari', -40, 40) - 633.3) < 0.1, 'full regen brake at cruise');
  assert.ok(Math.abs(humHz(0, 'ari', 40, 40) - 100) < 0.1, 'pushing from a stand');
  assert.ok(Math.abs(humHz(-22, 'ari', -40, 40) - 833.3) < 0.1, 'moving backwards, pushing backwards: the same rise');
  assert.equal(humHz(22, 'bus', 40, 40), humHz(22, 'bus'), 'the bus has no slip');
});

test('loudness follows the coil force, the jaws add a little, and her tips are about 25 dB below the bus', () => {
  assert.ok(humGain(40, 0, 40, 'bus') > humGain(10, 0, 40, 'bus'));
  assert.ok(humGain(40, 100, 40, 'bus') > humGain(40, 0, 40, 'bus'));
  const ratio = humGain(40, 0, 40, 'ari') / humGain(40, 0, 40, 'bus');
  assert.ok(20 * Math.log10(ratio) < -20 && 20 * Math.log10(ratio) > -30, `${(20 * Math.log10(ratio)).toFixed(1)} dB`);
  assert.equal(CHOPPER_HZ, 900);
});

test('a seamless loop: the cut is shorter by the fade, and the seam is a crossfade of head and tail', async () => {
  const { seamlessLoop } = await import('../src/sound.js');
  const sr = 1000, x = new Float32Array(2000).map((_, i) => Math.sin(i * 0.3));
  const out = seamlessLoop([x], sr, 0.2, 1.2, 0.1);
  assert.equal(out.length, 900);
  assert.equal(out.channels[0][500], x[700]);                          // the middle is the recording
  const w = 0.5 * (1 - Math.cos(Math.PI * 50 / 100));
  assert.ok(Math.abs(out.channels[0][50] - (x[250] * Math.sqrt(w) + x[1150] * Math.sqrt(1 - w))) < 1e-6);   // the head carries the tail faded in
});

test('doppler: the bus ahead is heard higher while she closes on it, lower once she is past', async () => {
  const { doppler } = await import('../src/sound.js');
  const ahead = doppler(30, 22, 3), behind = doppler(-30, 22, 3);
  assert.ok(ahead > 1.05 && ahead < 1.06, `ahead ${ahead.toFixed(3)}`);
  assert.ok(behind > 0.94 && behind < 0.95, `behind ${behind.toFixed(3)}`);
  assert.equal(doppler(30, 3, 3), 1);
});
