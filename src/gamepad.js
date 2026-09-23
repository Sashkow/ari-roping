// SPDX-License-Identifier: GPL-3.0-or-later
// A radio transmitter or any gamepad as the controller. A RadioMaster TX12 in EdgeTX "USB Joystick" mode is a plain
// HID joystick: its first channels arrive as axes, and a switch arrives as an axis or as a button depending on how the
// model is set up on the radio, so every function can be mapped to either. Sticks are analog: no ramps, the stick is
// the command. Pure functions here (node can test them); main.js does the polling and the mapping screen.
import { clamp } from './util.js';

// EdgeTX default channel order AETR, sticks in mode 2: ch1 aileron = right stick left-right, ch2 elevator = right stick
// up-down, ch3 throttle = left stick up-down (does not centre), ch4 rudder = left stick left-right, ch5 here a button
// or switch of the radio. The radio sends ch1..ch7 as X, Y, Z, Rx, Ry, Rz, Throttle, and browsers number those differently:
//   Chrome (Linux) keeps that order:            0 X ch1, 1 Y ch2, 2 Z ch3, 3 Rx ch4, 4 Ry ch5, ...
//   Firefox (Linux) takes the radio for a standard gamepad (it reports gamepad buttons): X, Y, Rx, Ry are axes 0 to 3,
//   and Z, which is ch3, the throttle stick, arrives as the analog left trigger: button 6, 0 at the bottom, 1 at the top.
//                                               0 X ch1, 1 Y ch2, 2 Rx ch4, 3 Ry ch5, button 6 = Z ch3
// (both confirmed on the author's TX12, 2026-09-20).
// The author's set-up (2026-09-20): the left stick up-down is the whole body control, by position: at the bottom she is
// narrow (the wing off, what G does), above it she is spread at a pitch that runs to 90 degrees at the top, which is the
// flare; so neither G nor F is needed on the radio. The button on ch5 turns the automatic stabilisation (the balance
// assist) on and off, the button on ch6 connects and disconnects her poles, the left stick's left-right does nothing.
//   ch5 is Ry: Chrome axis 4, Firefox axis 3.   ch6 is Rz: Chrome axis 5, Firefox the analog right trigger, button 7.
// A function may have several sources (an array), or none (null).
const layout = (lift, grip, assist) => ({
  speed: { kind: 'axis', index: 0, invert: false },          // right stick left-right: brake / speed up her tips
  pole: { kind: 'axis', index: 1, invert: false },           // right stick up-down: up pulls the poles in (held in the air: the hoop)
  lift,                                                      // left stick up-down: narrow at the bottom, then wing, then flare at the top
  grip,                                                      // connect / disconnect her poles, one press
  assist,                                                    // automatic stabilisation on / off, one press
  wing: null, wingToggles: true,                             // optional: a control of its own for wing on / off; the stick then only sets the pitch
  flare: null,                                               // optional: the top of the lift stick already is the flare
  liftTopDeg: 90,                                            // pitch at the top of the lift stick
  deadzone: 0.06,
});
export const MAPPINGS = {
  chrome: layout({ kind: 'axis', index: 2, invert: false }, { kind: 'axis', index: 5, invert: false }, { kind: 'axis', index: 4, invert: false }),
  firefox: layout({ kind: 'button', index: 6, invert: false }, { kind: 'button', index: 7, invert: false }, { kind: 'axis', index: 3, invert: false }),
};
export const DEFAULT_MAPPING = MAPPINGS.chrome;
export const defaultMappingFor = (userAgent = '') => (/firefox/i.test(userAgent) ? { name: 'Firefox axis order', mapping: MAPPINGS.firefox } : { name: 'Chrome axis order', mapping: MAPPINGS.chrome });

const one = (m) => (Array.isArray(m) ? m[0] : m);
const raw = (pad, m0) => {                                   // as an axis, -1..1; an analog button (a trigger) counts from -1 released to +1 pressed
  const m = one(m0);
  if (!m) return 0;
  if (m.kind === 'button') { const b = pad.buttons[m.index]; return b ? (2 * (b.value || (b.pressed ? 1 : 0)) - 1) * (m.invert ? -1 : 1) : -1; }
  const v = pad.axes[m.index]; return (Number.isFinite(v) ? v : 0) * (m.invert ? -1 : 1);
};
const on = (pad, m) => (Array.isArray(m) ? m : [m]).some((x) => x && raw(pad, x) > 0.5);
const dead = (v, dz) => (Math.abs(v) < dz ? 0 : (Math.sign(v) * (Math.abs(v) - dz)) / (1 - dz));

/** One reading of the pad as analog commands: speed and pole in -1..1, lift as a position 0..1, grip and flare as booleans. */
export function readPad(pad, mapping) {
  const dz = mapping.deadzone ?? 0.06;
  return {
    speed: dead(clamp(raw(pad, mapping.speed), -1, 1), dz),
    pole: dead(clamp(raw(pad, mapping.pole), -1, 1), dz),
    lift: clamp((raw(pad, mapping.lift) + 1) / 2, 0, 1),
    grip: on(pad, mapping.grip),
    flare: on(pad, mapping.flare),
    wing: mapping.wing ? on(pad, mapping.wing) : null, wingToggles: !!mapping.wingToggles,
    assist: on(pad, mapping.assist), liftTopDeg: mapping.liftTopDeg ?? 90,
  };
}

/** Which control moved most since `before`: for the mapping screen. Returns {kind, index} or null. */
export function movedControl(pad, before) {
  let best = null, amount = 0.45;
  pad.axes.forEach((v, i) => { const d = Math.abs(v - (before.axes[i] ?? 0)); if (d > amount) { amount = d; best = { kind: 'axis', index: i }; } });
  pad.buttons.forEach((b, i) => { if (Math.abs((b.value || (b.pressed ? 1 : 0)) - (before.buttons[i] || 0)) > 0.45) best = { kind: 'button', index: i }; });
  return best;
}
export const snapshot = (pad) => ({ axes: [...pad.axes], buttons: pad.buttons.map((b) => b.value || (b.pressed ? 1 : 0)) });
