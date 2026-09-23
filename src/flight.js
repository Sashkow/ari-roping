// Off the wire: a spinning rigid body. State {x, y, vx, vy, phi, L, l}: head position (y above the wires),
// velocity, pole direction from head to tips (radians, y up), angular momentum, pole length. Spin is L / I(l),
// so pole length is her spin control. Spread, she flies: lift and drag from the same body model as on the
// wire, pitch measured against the airflow, and the spread body damps her spin (declared simplification,
// design decision 6). Grip held: the poles reach for the wire (design decision 7). Poles fully in and pull-in held:
// she curls into the hoop, f.curl 0..1, ring inertia, no pole drag; anything else has to uncurl her first (decision 4).
import { smooth } from './util.js';

export function makeFlight(P, physics, tuning) {
  const M = P.M, MP = physics.body.poles_mass, LB = physics.body.length;
  const L_MIN = physics.poles.short, L_MAX = physics.poles.long;
  const LONG_CDA = tuning.long_cda ?? 0.015, HOOP_CDA = tuning.hoop_cda ?? 0.02, HOOP_HOLD = tuning.hoop_hold ?? 0.12, HOOP_TIME = tuning.hoop_time ?? 0.2;
  const AUTO_OPEN = tuning.hoop_auto_open ?? true, LOOK = tuning.hoop_look_ahead ?? 0.9;

  /** Spin inertia about her own centre (roping_sim.Sim.inertia): body and poles in line, blended toward the closed ring as she curls. */
  function inertia(l, curl = 0) {
    const c = smooth(curl), ring = (M + MP) * ((LB + l) / (2 * Math.PI)) ** 2;
    return (1 - c) * inLine(l) + c * ring;
  }
  function inLine(l) {
    const m = M + MP, cb = LB / 2, cp = LB + l / 2, c = (M * cb + MP * cp) / m;
    return (M * LB * LB) / 12 + M * (cb - c) ** 2 + (MP * l * l) / 12 + MP * (cp - c) ** 2;
  }

  /** Let go: attached state {th, om, u, x} with pole length l and its rate dl -> flight state. */
  function release(st, l, dl) {
    const sin = Math.sin(st.th), cos = Math.cos(st.th);
    return { x: st.x + l * sin, y: -l * cos, vx: st.u + l * st.om * cos + dl * sin, vy: l * st.om * sin - dl * cos,
             phi: Math.atan2(cos, -sin), L: inertia(l) * st.om, l, curl: 0, hold: 0, spreadNow: false };
  }

  /**
   * One step in the air. ctl: {grip, poleRate, spread, pitch}. Returns null, or the attached state
   * {th, om, u, x, l, dl, hard} in the step a reaching tip crosses the wire plane.
   */
  function step(f, ctl, dt) {
    // the hoop: pull-in held at the shortest length curls her; letting out, reaching or spreading must first uncurl her
    f.curl ??= 0; f.hold ??= 0;
    const pullingIn = (ctl.poleRate || 0) < 0 && f.l <= L_MIN + 1e-6 && !ctl.grip && !ctl.spread;
    f.waiting = !!(ctl.grip && f.curl > 0 && AUTO_OPEN && !f.opening && !f.dry);
    f.hold = pullingIn ? f.hold + dt : 0;
    // In the hoop she turns several times a second: nobody can pick the instant to open by hand. When grip goes down she
    // picks it herself, once: she runs the rest of the flight ahead in her head for every instant of her next turn, opening
    // and reaching from each, and keeps the one from which her poles come round onto the wire with the tips landing ahead of
    // her and the least speed left along the poles. If none of them catches she opens at once.
    f.clock = (f.clock || 0) + dt;
    if (!ctl.grip) { f.opening = false; f.openAt = null; }
    else if (f.curl > 0 && AUTO_OPEN && !f.opening && !f.dry) {
      if (f.openAt == null) f.openAt = f.clock + bestDelay(f);
      if (f.clock >= f.openAt) f.opening = true;
    }
    const reaching = ctl.grip && (f.opening || !AUTO_OPEN || f.curl === 0 || f.dry);
    const wantsOut = reaching || ctl.spread || (ctl.poleRate || 0) > 0;
    if (wantsOut) f.curl = Math.max(0, f.curl - dt / HOOP_TIME);
    else if (f.hold >= HOOP_HOLD || (f.curl > 0 && f.l <= L_MIN + 1e-6)) f.curl = Math.min(1, f.curl + dt / HOOP_TIME);
    const open = f.curl < 0.05, spread = ctl.spread && open, grip = reaching;
    f.spreadNow = spread;
    // pole length: the player's spin control, or the reach for the wire while grip is held
    let dl = open ? ctl.poleRate || 0 : 0;
    if (grip && open) {
      const s = Math.sin(f.phi), need = Math.abs(s) > 1e-6 ? -f.y / s : Infinity;     // length at which the tip meets the wire
      const target = need >= L_MIN && need <= L_MAX ? need : L_MAX;
      dl = Math.min(Math.max((target - f.l) / dt, -tuning.reach_speed), tuning.reach_speed);
    }
    const tipBefore = f.y + f.l * Math.sin(f.phi);
    f.l = Math.min(Math.max(f.l + dl * dt, L_MIN), L_MAX);

    const ax = f.vx + P.WIND, ay = f.vy, s = Math.hypot(ax, ay) || 1e-9, q = 0.5 * P.RHO * s * s;
    const c = smooth(f.curl);
    const [lift, bodyDrag] = spread ? P.body(true, ctl.pitch, q, s) : [0, q * (LONG_CDA + (HOOP_CDA - LONG_CDA) * c)];
    const across = Math.abs(Math.sin(f.phi - Math.atan2(ay, ax)));
    const drag = bodyDrag + (1 - c) * P.POLE_K * f.l * across * across * s * s;      // curled, her poles are part of the ring
    const m = M + MP;
    f.vx += ((-drag * ax - lift * ay) / s / m) * dt;
    f.vy += ((-drag * ay + lift * ax) / s / m - P.G) * dt;
    f.x += f.vx * dt; f.y += f.vy * dt;
    if (spread) f.L -= (f.L / tuning.spin_damping_spread) * dt;
    f.phi += (f.L / inertia(f.l, f.curl)) * dt;

    const tipAfter = f.y + f.l * Math.sin(f.phi);
    if (grip && open && tipBefore * tipAfter <= 0 && tipBefore !== tipAfter) {
      // put the tip exactly on the wire along the pole, then hand over to the pendulum
      const sinp = Math.sin(f.phi), l = Math.abs(sinp) > 1e-6 ? Math.min(Math.max(-f.y / sinp, L_MIN), L_MAX) : f.l;
      const tx = f.x + l * Math.cos(f.phi);
      const th = Math.atan2(f.x - tx, -f.y);
      const along = -f.vy * Math.cos(th) - dl;                                        // speed along the poles that the catch must absorb
      return { th, om: (f.vy * Math.sin(th)) / l, u: f.vx, x: tx, l, dl: 0, hard: Math.abs(along) > tuning.catch_absorb, along };
    }
    return null;
  }

  /** Run the opening and the reach ahead on a copy, after staying curled for `delay` more seconds. */
  function foresee(f0, delay = 0) {
    const f = { ...f0, dry: true, opening: false, openAt: null }, h = 0.002, idle = { grip: false, poleRate: 0, spread: false, pitch: 0 }, reach = { ...idle, grip: true };
    for (let i = 0; i < delay / h; i++) step(f, idle, h);
    f.opening = true;
    for (let i = 0; i < LOOK / h; i++) {
      const got = step(f, reach, h);
      if (got) return { hard: got.hard, along: Math.abs(got.along), tipsAhead: got.x > f.x, t: delay + i * h };
      if (f.y < -L_MAX - 0.5) return null;
    }
    return null;
  }
  function bestDelay(f) {
    const turn = (2 * Math.PI) / Math.max(Math.abs(f.L / inertia(f.l, f.curl)), 1e-6), span = Math.min(Math.max(turn, 0.12), 0.6);
    let best = 0, bestScore = Infinity;
    for (let d = 0; d <= span; d += 0.004) {
      const p = foresee(f, d);
      const score = p ? (p.tipsAhead ? 0 : 100) + (p.hard ? 10 : 0) + 0.5 * p.along + p.t : 1000 + d;
      if (score < bestScore) { bestScore = score; best = d; }
    }
    return bestScore >= 1000 ? 0 : best;
  }

  return { inertia, release, step, foresee, spin: (f) => f.L / inertia(f.l, f.curl || 0), L_MIN, L_MAX, ringDiameter: (l) => (LB + l) / Math.PI };
}
