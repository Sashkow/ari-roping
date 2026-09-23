// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readPad, movedControl, snapshot, MAPPINGS, defaultMappingFor } from '../src/gamepad.js';
import { makeCommands } from '../src/input.js';

const cfg = { throttle_ramp: 0.25, throttle_full: 10, pitch_rate_deg: 90, pole_speed: 6 };
const deg = (r) => (r * 180) / Math.PI;
const pad = (axes, buttons = []) => ({ axes, buttons: buttons.map((p) => ({ pressed: p, value: p ? 1 : 0 })) });
// the author's TX12 as Firefox shows it: X, Y, Rx (left stick sideways), Ry (the ch5 button); the throttle stick is analog
// button 6, the ch6 button analog button 7
const radio = ({ x = 0, y = 0, side = 0, ch5 = -1, thr = 0, ch6 = 0 } = {}) => ({ axes: [x, y, side, ch5, 0],
  buttons: Array.from({ length: 24 }, (_, i) => ({ pressed: (i === 6 ? thr : i === 7 ? ch6 : 0) > 0.5, value: i === 6 ? thr : i === 7 ? ch6 : 0 })) });
const FF = defaultMappingFor('Mozilla/5.0 (X11; Linux x86_64; rv:142.0) Gecko/20100101 Firefox/142.0').mapping;

test('defaults are chosen by browser', () => {
  assert.equal(FF, MAPPINGS.firefox); assert.equal(defaultMappingFor('Chrome/140').mapping, MAPPINGS.chrome);
});

test('right stick: left-right is tip acceleration by how far it is pushed, up pulls the poles in', () => {
  const c = makeCommands(cfg);
  const half = c.update({}, 0.001, readPad(radio({ x: -0.5 }), FF)).accel, full = c.update({}, 0.001, readPad(radio({ x: -1 }), FF)).accel;
  assert.ok(half < -5 && half > -8, `half stick is a gentle brake: ${half.toFixed(1)} m/s2`); assert.equal(full, -20);
  assert.equal(c.update({}, 0.001, readPad(radio({ y: 1 }), FF)).poleRate, -6);
  assert.equal(c.update({}, 0.001, readPad(radio({ y: 1 }), { ...FF, pole: { kind: 'axis', index: 1, invert: true } })).poleRate, 6, 'Flip reverses it');
});

test('button 7 connects and disconnects her poles: one press each, holding does not repeat', () => {
  const c = makeCommands(cfg), seen = [];
  for (const b of [0, 0, 1, 1, 0, 1]) seen.push(c.update({}, 0.001, readPad(radio({ ch6: b }), FF)).gripPressed);
  assert.deepEqual(seen, [false, false, true, false, false, true]);
});

test('button 6, the left stick up-down, is the whole body control: narrow at the bottom, the wing above it, the flare at the top', () => {
  const c = makeCommands(cfg);
  assert.equal(c.update({}, 0.001, readPad(radio({ thr: 0 }), FF)).spread, false, 'at the bottom she is narrow: the wing off, no G needed');
  for (const [thr, want] of [[0.1, 9], [0.27, 24.3], [0.5, 45], [1, 90]]) {
    const s = c.update({}, 0.001, readPad(radio({ thr }), FF)); assert.ok(s.spread && Math.abs(deg(s.pitch) - want) < 0.1, `button 6 = ${thr}: ${deg(s.pitch).toFixed(1)} deg`);
  }
});

test('axis 3 is the button for the automatic stabilisation, read as on or off; the page toggles on its press', () => {
  assert.equal(readPad(radio({ ch5: -1 }), FF).assist, false); assert.equal(readPad(radio({ ch5: 1 }), FF).assist, true);
  const c = makeCommands(cfg); assert.equal(c.update({}, 0.001, readPad(radio({ ch5: 1, thr: 0 }), FF)).spread, false, 'it does not open the wing');
});

test('axis 2, the left stick sideways, does nothing; the keyboard\'s F still flares', () => {
  const c = makeCommands(cfg);
  for (const side of [-1, 1]) { const s = c.update({}, 0.001, readPad(radio({ side }), FF)); assert.ok(!s.spread && !s.flare && !s.gripPressed && s.accel === 0 && s.poleRate === 0); }
  assert.ok(c.update({ flare: true }, 0.001, readPad(radio(), FF)).flare);
});

test('Chrome sees the same radio as plain axes: lift axis 2, stabilisation axis 4, connect axis 5', () => {
  const c = makeCommands(cfg), M = MAPPINGS.chrome;
  let s = c.update({}, 0.001, readPad(pad([0, 0, 0, 0, -1, -1, 0]), M)); assert.ok(s.spread && Math.abs(deg(s.pitch) - 45) < 0.1);
  assert.equal(readPad(pad([0, 0, -1, 0, 1, -1, 0]), M).assist, true);
  s = c.update({}, 0.001, readPad(pad([0, 0, -1, 0.9, -1, 1, 0]), M)); assert.equal(s.gripPressed, true);
});

test('optional: a control of its own for the wing; the lift stick then only sets the pitch', () => {
  const c = makeCommands(cfg), M = { ...FF, wing: { kind: 'axis', index: 4, invert: false }, wingToggles: false };
  const r = (wingSw, thr) => { const p = radio({ thr }); p.axes[4] = wingSw; return p; };
  assert.equal(c.update({}, 0.001, readPad(r(-1, 0.5), M)).spread, false); const s = c.update({}, 0.001, readPad(r(1, 0.5), M)); assert.ok(s.spread && Math.abs(deg(s.pitch) - 45) < 0.1);
});

test('mapping screen: the control that moved is found, axis, button or analog button', () => {
  const before = snapshot(radio());
  assert.deepEqual(movedControl(radio({ y: 0.9 }), before), { kind: 'axis', index: 1 });
  assert.deepEqual(movedControl(radio({ ch6: 1 }), before), { kind: 'button', index: 7 });
  assert.deepEqual(movedControl(radio({ thr: 0.8 }), before), { kind: 'button', index: 6 });
  assert.equal(movedControl(radio({ x: 0.1 }), before), null);
});
