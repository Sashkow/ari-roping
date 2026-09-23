// SPDX-License-Identifier: GPL-3.0-or-later
// Ari on the wire: a point mass on rigid poles whose tips are a second mass (the poles') riding the wire.
// Port of roping_sim.Sim.step and Sim.tip_forces (radio_ocean, change roping-tip-dynamics): same force
// list, same semi-implicit Euler, same pole-force formula, same tip equation. Along the wire the tips
// are driven by the coils (bounded, symmetric, fading near standstill), the jaws (backward only, up to
// the grip) and the shoe (mu times the previous step's pole force, against the tips' motion):
//   aP = (fApplied + fShoe + T0 sin th) / (mTip + M sin^2 th),  T0 the pole force at aP = 0.
// A control may ask for a force in newtons, or for an acceleration ({accel: a, hold}), which is resolved to
// the force that would give it and then clamped, so the tips slip when asked for more than they have. With
// hold the hands may close to keep the wish; without it (the player's no-key coast) the jaws close only when
// the wish is to slow down, and the tips ride the coils, which lets a swing drain into them.
// Angles from the downward vertical, body ahead of the tips positive. Pole force: + tension,
// - compression. Constants come from data/constants.json, never from this file.
import { makeWing, makeBody } from './aero.js';

export const MODE = { narrow: 0, wing: 1, flare: 2, body: 3 };   // 0-2 are the simulations' modes; body is the player's spread body at a pitch

export function makePhysics(physics, tipsOverride = {}) {
  const G = physics.sim.g, M = physics.body.mass, W = M * G;
  const TIPS = { ...(physics.tips || {}), ...tipsOverride, coil: { ...((physics.tips || {}).coil || {}), ...(tipsOverride.coil || {}) } };
  const M_TIP = TIPS.mass ?? physics.body.poles_mass, COIL = TIPS.coil.thrust ?? Infinity, FADE = TIPS.coil.fade_speed ?? 0;
  const GRIP = TIPS.grip ?? Infinity, MU = TIPS.shoe_mu ?? 0, SMOOTH_U = TIPS.sign_smooth ?? 0.05;
  const RHO = physics.air.density, WIND = physics.air.headwind;
  const POLE_K = physics.poles.count * 0.5 * RHO * physics.poles.cd * physics.poles.diameter;  // N per m of pole per (m/s)^2
  const NARROW_CDA = physics.gaits.narrow_cda, FLARE_K = physics.flare_k;
  const wing = makeWing(physics), body = makeBody(physics, physics.tuning);

  /**
   * Forces and angular acceleration for one instant on the wire.
   * th, om: pole angle and rate; u: tip speed; aP: tip acceleration; l, dl: pole length and its rate;
   * mode: MODE.*; level: angle of attack in radians (wing) or 0..1 (flare).
   */
  function attached(th, om, u, aP, l, dl, mode, level) {
    const sin = Math.sin(th), cos = Math.cos(th);
    const vx = u + l * om * cos + dl * sin, vy = l * om * sin - dl * cos;
    const ax = vx + WIND, ay = vy;
    const s = Math.hypot(ax, ay) || 1e-9;
    const q = 0.5 * RHO * s * s;
    let lift = 0, drag;
    if (mode === MODE.wing) [lift, drag] = wing(level, q);
    else if (mode === MODE.body) [lift, drag] = body(true, level, q, s);
    else drag = q * NARROW_CDA + (mode === MODE.flare ? level * FLARE_K * s * s : 0);
    const fx = (-drag * ax) / s - (lift * ay) / s;
    const fy = (-drag * ay) / s + (lift * ax) / s - W;
    const vn = (u + WIND) * cos + (l * om) / 2;                       // air across the middle of the poles
    const pole = -POLE_K * l * Math.abs(vn) * vn;
    const alpha = ((fx * cos + fy * sin) / M - aP * cos) / l - (2 * dl * om) / l + pole / (2 * M * l);
    const tension = fx * sin - fy * cos + M * l * om * om - M * aP * sin;
    return { alpha, vx, vy, lift, drag, tension, wireX: -tension * sin, wireUp: -tension * cos };
  }

  /** Advance the attached state by dt, in place. state: {th, om, u, x}. Returns the force record of the step. */
  function stepAttached(state, ctl, dt) {
    const out = attached(state.th, state.om, state.u, ctl.aP, ctl.l, ctl.dl, ctl.mode, ctl.level);
    state.om += out.alpha * dt;
    state.th += state.om * dt;
    state.x += state.u * dt;
    state.u += ctl.aP * dt;
    return out;
  }

  /**
   * The three along-wire forces on the tips for one step and the acceleration they give (roping_sim.Sim.tip_forces).
   * u tip speed, t0 the pole force at zero tip acceleration, sin = sin(th), cmd a force in N or {accel: a}, tPrev
   * the previous step's pole force (the shoe uses it: one step of lag breaks the loop).
   */
  function tipForces(u, t0, sin, cmd, tPrev) {
    const denom = M_TIP + M * sin * sin;
    const sgn = SMOOTH_U > 0 ? Math.max(-1, Math.min(1, u / SMOOTH_U)) : Math.sign(u);
    const fShoe = -MU * Math.abs(tPrev) * sgn;
    const fCmd = typeof cmd === 'object' ? cmd.accel * denom - t0 * sin - fShoe : cmd;
    const coil = COIL * (FADE > 0 ? Math.min(1, Math.abs(u) / FADE) : 1);
    // the jaws are friction: they only oppose the tips' motion, whichever way along the wire that is, and they close only when
    // the command asks to slow down (a wished acceleration against the motion, or a force against it). No key (a wish for zero
    // acceleration) rides on the coils alone: held by the jaws the tips would be a fixed bar and a swing could never drain into
    // them (14 loops after a catch with the jaws holding, 3 without). The coils push either way.
    const want = typeof cmd === 'object' ? cmd.accel : cmd, braking = want * u < 0 || (typeof cmd === 'object' ? !!cmd.hold : true), grip = braking ? GRIP : 0;
    const [lo, hi] = u >= 0 ? [-(coil + grip), coil] : [-coil, coil + grip];
    const fApplied = Math.max(lo, Math.min(hi, fCmd));
    const fCoil = Math.max(-coil, Math.min(coil, fApplied));
    return { aP: (fApplied + fShoe + t0 * sin) / denom, fCmd, fApplied, fCoil, fJaw: fApplied - fCoil, fShoe, slip: fCmd - fApplied };
  }

  /**
   * One step on the wire with force-driven tips, in place. state: {th, om, u, x, tPrev}; ctl: {cmd, l, dl, mode, level}.
   * Returns the force record of the step with the tip forces and aP in it.
   */
  function stepTips(state, ctl, dt) {
    const sin = Math.sin(state.th);
    const t0 = attached(state.th, state.om, state.u, 0, ctl.l, ctl.dl, ctl.mode, ctl.level).tension;
    const tf = tipForces(state.u, t0, sin, ctl.cmd, state.tPrev || 0);
    const out = stepAttached(state, { aP: tf.aP, l: ctl.l, dl: ctl.dl, mode: ctl.mode, level: ctl.level }, dt);
    state.tPrev = out.tension;
    return { ...out, ...tf };
  }

  return { attached, stepAttached, tipForces, stepTips, G, M, W, RHO, WIND, POLE_K, wing, body, tips: { mass: M_TIP, coil: COIL, fade: FADE, grip: GRIP, mu: MU } };
}
