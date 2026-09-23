// SPDX-License-Identifier: GPL-3.0-or-later
// The run itself, with no drawing and no DOM, so node can play it: on the wire or in the air, the player's
// commands in, her state and what ended the run out.
import { makePhysics, MODE } from './physics.js';
import { makeFlight } from './flight.js';
import { makeWorld } from './world.js';
import { rad, clamp } from './util.js';

export function makeGame(physics, level, opts = {}) {
  const T = level.tuning, P = makePhysics({ ...physics, tuning: T }, level.tips || {}), F = makeFlight(P, physics, T), world = makeWorld(physics, level);
  const L_MIN = physics.poles.short, L_MAX = physics.poles.long, LB = physics.body.length;

  function steadyAngle(u, l) {                       // where she hangs at a steady speed, narrow
    let a = rad(-89), b = 0;
    for (let i = 0; i < 50; i++) { const m = (a + b) / 2; if (P.attached(m, 0, u, 0, l, 0, MODE.narrow, 0).alpha > 0) a = m; else b = m; }
    return (a + b) / 2;
  }

  const g = {
    t: 0, mode: 'wire', over: null, won: false, world, P, F,
    st: { th: steadyAngle(level.start.speed, L_MAX), om: 0, u: level.start.speed, x: 0, tPrev: 0 }, l: L_MAX, dl: 0,
    fl: null, out: null, aP: 0, saturated: false, hardCatch: false, catches: 0, releases: 0,
    startSpeed: level.start.speed, airTime: 0, apex: 0, turns: 0, passedAt: null,
    arcUntil: -1, arcs: 0, events: [], reaching: false, balance: null, assistOn: !!(level.assists && level.assists.balance),
  };
  g.arcing = () => g.t < g.arcUntil;

  g.head = () => (g.mode === 'wire' ? [g.st.x + g.l * Math.sin(g.st.th), -g.l * Math.cos(g.st.th)] : [g.fl.x, g.fl.y]);
  g.tips = () => (g.mode === 'wire' ? [g.st.x, 0] : [g.fl.x + g.fl.l * Math.cos(g.fl.phi), g.fl.y + g.fl.l * Math.sin(g.fl.phi)]);
  g.poleLength = () => (g.mode === 'wire' ? g.l : g.fl.l);
  g.velocity = () => (g.mode === 'wire' ? [g.out ? g.out.vx : g.st.u, g.out ? g.out.vy : 0] : [g.fl.vx, g.fl.vy]);

  g.step = function (cmd, dt) {
    if (g.over) return;
    g.t += dt; world.step(dt); g.events.length = 0;
    if (g.arcing()) cmd = { ...cmd, spread: false };
    g.shown = cmd;          // while the arc burns she cannot flare or fly: her body stays narrow
    const [hx0, hy0] = g.head();
    if (g.mode === 'wire') {
      const l0 = g.l;
      g.l = clamp(g.l + cmd.poleRate * dt, L_MIN, L_MAX); g.dl = (g.l - l0) / dt;
      cmd = balanced(cmd); g.shown = cmd;                  // what her body actually does, for the drawing
      const mode = cmd.spread ? MODE.body : MODE.narrow, level = cmd.spread ? cmd.pitch : 0;
      // the throttle is a wished tip acceleration; the tips give what the coils, the jaws and the shoe can (physics.js)
      const wish = g.st.u <= 0.5 && cmd.accel < 0 ? 0 : cmd.accel;
      g.out = P.stepTips(g.st, { cmd: { accel: wish }, l: g.l, dl: g.dl, mode, level }, dt);
      g.aP = g.out.aP; g.saturated = Math.abs(g.out.slip) > 1;
      const geo = world.geom();
      if (world.bus.on && g.st.x > geo.shoes - 0.12 && g.st.x < geo.shoes + 0.6 && g.st.u > world.bus.v) g.over = "Her tips ran into the trolleybus's collector shoes.";
      if (Math.abs(g.out.tension) > T.hang_limit) cmd = { ...cmd, gripPressed: true };
      if (cmd.gripPressed && !g.over) { g.fl = F.release(g.st, g.l, g.dl); g.mode = 'air'; g.reaching = false; g.releases++; g.airTime = 0; g.apex = g.fl.y; g.turns = 0; g.phi0 = g.fl.phi; }
    } else {
      const phiBefore = g.fl.phi;
      // one press of grip in the air and she goes for the wire, until she has it; a second press calls it off
      if (cmd.gripPressed && g.airTime > 0.15) g.reaching = !g.reaching;
      const got = F.step(g.fl, { grip: g.reaching, poleRate: g.reaching ? 0 : cmd.poleRate, spread: cmd.spread && !g.reaching, pitch: cmd.pitch }, dt);
      cmd = { ...cmd, spread: g.fl.spreadNow }; g.shown = cmd;                       // curled, she has to open before she can spread
      g.airTime += dt; g.apex = Math.max(g.apex, g.fl.y); g.turns += (g.fl.phi - phiBefore) / (2 * Math.PI);
      if (got) { g.reaching = false; g.st = { th: got.th, om: got.om, u: got.u, x: got.x, tPrev: 0 }; g.l = got.l; g.dl = 0; g.mode = 'wire'; g.catches++; g.hardCatch = got.hard; g.catchAlong = got.along; g.out = null; g.fl = null; }
    }
    const [hx, hy] = g.head(), tail = g.tailAngle(cmd);
    // spread wide between two wires 520 mm apart she touches both: 600 V strikes an arc between her and the wire.
    // It does not end the run; it folds her up and keeps her narrow for as long as it burns.
    if (!g.over && cmd.spread && hy0 * hy < 0) { g.arcUntil = g.t + T.arc_seconds; g.arcs++; g.events.push('arc'); }
    const curl = g.mode === 'air' && g.fl ? g.fl.curl || 0 : 0, reach = LB + (F.ringDiameter(g.poleLength()) - LB) * curl;   // the hoop is compact
    if (!g.over) g.over = world.hit([[hx, hy], [hx + reach * Math.cos(tail), hy + reach * Math.sin(tail)]]);
    if (!g.over && world.bus.on && g.mode === 'wire' && g.catches > 0 && g.st.x > world.geom().front + 3) {
      g.passedAt ??= g.t;
      if (g.t - g.passedAt > 1.5) { g.over = 'She is past the trolleybus.'; g.won = true; }
    }
  };

  // The lifted gait is an inverted pendulum: left alone, any error in her pole angle grows. With the assist on, the
  // wing's pitch is trimmed the way the simulations do it: the pitch that balances her at the wanted lead angle at this
  // speed, corrected in proportion to her angle error and her swing rate. It acts only once she is well ahead of her tips.
  const BAL = level.balance;
  function trimPitch(lead, u, l) {                  // pitch at which the moments about her tips cancel at that lead angle, or null
    const f = (a) => P.attached(lead, 0, u, 0, l, 0, MODE.body, a).alpha;
    let lo = rad(BAL.pitch_min_deg), hi = rad(physics.gaits.wing.alpha_max_deg);
    if (f(lo) > 0 || f(hi) < 0) return null;         // too slow (or far too fast) for this lead angle
    for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (f(m) < 0) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  function balanced(cmd) {
    g.balance = null;
    if (!g.assistOn || !BAL || !cmd.spread || cmd.flare || g.st.th < rad(BAL.engage_deg)) return cmd;
    const lead = cmd.lead ?? rad(BAL.lead_deg), trim = trimPitch(lead, g.st.u, g.l);
    if (trim === null) { g.balance = { lead, ok: false }; return { ...cmd, pitch: rad(physics.gaits.wing.alpha_max_deg) }; }
    const pitch = clamp(trim - BAL.kp * (g.st.th - lead) - BAL.kd * g.st.om, rad(BAL.pitch_min_deg), rad(physics.gaits.wing.alpha_max_deg));
    g.balance = { lead, ok: true, trim, pitch };
    return { ...cmd, pitch };
  }
  if (opts.gait === 'lifted') g.st.th = rad(BAL ? BAL.lead_deg : 65);

  let tail = Math.PI;
  g.tailAngle = function (cmd) {                     // where her body points from the head: in line with the poles, or spread against the air
    const [vx, vy] = g.velocity(), course = Math.atan2(vy, vx);
    const poleDir = g.mode === 'wire' ? Math.atan2(Math.cos(g.st.th), -Math.sin(g.st.th)) : g.fl.phi;
    const want = cmd && cmd.spread ? course + Math.PI + Math.min(cmd.pitch, rad(65)) : poleDir + Math.PI;
    let d = (want - tail) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI;
    tail += d * 0.02;
    return tail;
  };
  return g;
}
