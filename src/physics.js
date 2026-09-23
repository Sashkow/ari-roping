// SPDX-License-Identifier: GPL-3.0-or-later
// Ari on the wire: a point mass on rigid massless poles pinned at the tips, which move along the wire.
// Port of roping_sim.Sim.step (radio_ocean), same force list, same semi-implicit Euler, same pole-force
// formula. Angles from the downward vertical, body ahead of the tips positive. Pole force: + tension,
// - compression. Constants come from data/constants.json, never from this file.
import { makeWing, makeBody } from './aero.js';

export const MODE = { narrow: 0, wing: 1, flare: 2, body: 3 };   // 0-2 are the simulations' modes; body is the player's spread body at a pitch

export function makePhysics(physics) {
  const G = physics.sim.g, M = physics.body.mass, W = M * G;
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
   * The tip acceleration the wire can actually deliver. The force along the wire that the tips need is
   * F = -T sin(th), and T itself depends on the acceleration: F(a) = -T0 sin(th) + M a sin(th)^2, with T0
   * the pole force at a = 0. Beyond the grip limit the tips slip and deliver only what grip allows.
   */
  function limitTipAccel(th, om, u, aCmd, l, dl, mode, level, gripLimit) {
    const t0 = attached(th, om, u, 0, l, dl, mode, level).tension, sin = Math.sin(th), k = M * sin * sin;
    if (!(gripLimit < Infinity) || k < 1e-9) return { aP: aCmd, saturated: false };
    const lo = (-gripLimit + t0 * sin) / k, hi = (gripLimit + t0 * sin) / k;
    const aP = Math.min(Math.max(aCmd, lo), hi);
    return { aP, saturated: aP !== aCmd };
  }

  return { attached, stepAttached, limitTipAccel, G, M, W, RHO, WIND, POLE_K, wing, body };
}
