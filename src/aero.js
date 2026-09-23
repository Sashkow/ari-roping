// SPDX-License-Identifier: GPL-3.0-or-later
// Lift and drag of her spread body. Port of roping_gaits.Gaits.wing (radio_ocean): the Polhamus
// suction analogy for a very stubby wing, potential plus vortex lift, drag = cd0 + CL tan(alpha).
import { smooth } from './util.js';

export function makeWing(physics) {
  const w = physics.gaits.wing;
  const aspect = (w.span * w.span) / w.area;
  const kp = (Math.PI * aspect) / 2, kv = Math.PI;
  /** alpha in radians, q = dynamic pressure; returns [lift, drag] in newtons */
  return function wing(alpha, q) {
    const s = Math.sin(alpha), c = Math.cos(alpha);
    const cl = kp * s * c * c + kv * c * s * s;
    return [q * w.area * cl, q * w.area * (w.cd0 + cl * Math.tan(alpha))];
  };
}


/**
 * Her body as the player controls it: narrow, or spread at a pitch against the airflow.
 * Low pitch is the wing, full pitch is the flare, with a smooth blend between blendFrom and blendTo.
 * At zero blend this is exactly the simulations' wing, at full blend exactly their flare at level 1.
 * Returns [lift, drag] in newtons; s is airspeed, q dynamic pressure.
 */
export function makeBody(physics, tuning = {}) {
  const wing = makeWing(physics);
  const aMax = (physics.gaits.wing.alpha_max_deg * Math.PI) / 180;
  const from = ((tuning.blendFromDeg ?? 35) * Math.PI) / 180, to = ((tuning.blendToDeg ?? 70) * Math.PI) / 180;
  const narrow = physics.gaits.narrow_cda, flareK = physics.flare_k;
  return function body(spread, pitch, q, s) {
    if (!spread) return [0, q * narrow];
    const w = smooth((pitch - from) / (to - from));
    const [lw, dw] = wing(Math.min(Math.max(pitch, 0), aMax), q);
    return [(1 - w) * lw, (1 - w) * dw + w * (q * narrow + flareK * s * s)];
  };
}
