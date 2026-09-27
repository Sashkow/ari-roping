// SPDX-License-Identifier: GPL-3.0-or-later
// Candidate badges and lines as demos (tasks 12.2 and 12.3): each is a scripted key driver, like the
// autopilots, with a few parameters that tools/demo.mjs searches, and a `closes` check on the token
// stream that says whether the shape happened. Nothing here is a badge: the author picks from the demos.
// A plan returns the `keys` object of input.js for the current game state; `p` holds the parameters.
import { rad } from './util.js';
import { makeCommands } from './input.js';

const D = Math.PI / 180;
const has = (toks, name, f = () => true) => toks.find((k) => k.name === name && f(k));
const after = (toks, k0, name, f = () => true) => toks.find((k) => k.t > k0.t && k.name === name && f(k));
const between = (toks, a, b, name) => toks.some((k) => k.t > a.t && k.t < b.t && k.name === name);
const backsBetween = (toks, a, b) => toks.filter((k) => k.t > a.t && k.t < b.t && k.name === 'BACK').length;
const liftedEnter = (k) => k.name === 'LIFTED' && k.phase === 'enter';
/** Move the wing pitch toward `target` degrees with the pitch keys (90 deg/s in input.js; st.pitch mirrors the command layer). */
function setPitch(k, st, target) { k.pitchUp = st.pitch < target - 0.5; k.pitchDown = st.pitch > target + 0.5; st.pitch += ((k.pitchUp ? 1 : 0) - (k.pitchDown ? 1 : 0)) * 90 * 0.001; }

/** The solved launch: brake toward the bus, pull the poles in through the bottom of the swing, let go at `release` degrees. */
function launch(g, k, p, geo) {
  g.ap ??= { go: false };
  if (geo.shoes - g.st.x < (p.gap ?? 16.5)) g.ap.go = true;
  if (g.ap.go) { k.left = true; k.hard = !!p.hard; if (g.st.th > rad(-10)) k.up = true; if (g.st.th >= rad(p.release ?? 58)) k.grip = true; }
}
/** After a catch: back up to speed, poles out. */
function cruise(g, k) { k.right = g.st.u < g.startSpeed - 0.3; if (g.l < 2.39) k.down = true; }
/** In the air: the wing, but only above the wires (spread through the wire plane and an arc strikes), at `pitch` degrees. */
function glide(g, k, p, st) {
  if (!st.wingOn && g.fl.y > 0.3 && g.fl.vy > 0) { k.wing = true; st.wingOn = true; }
  if (st.wingOn) setPitch(k, st, p.pitch ?? 12);
}
/** After a catch: use the forward swing the catch gives her. `entry` is how: 'brake' the tips (throws her forward, costs speed),
 *  'pump' (pull the poles in through the bottom, as the launch does), 'coast' (nothing), or 'speed' (the page's recipe: speed up
 *  so she swings back, then brake; that one passes through a BACK). The wing goes on as her poles pass `wingAt` degrees going
 *  forward; the balance assist trims the pitch from 35 degrees on. */
function goLifted(g, k, p, st) {
  const e = p.entry ?? 'brake';
  if (e === 'speed') { st.phase ??= 'up'; if (st.phase === 'up') { k.right = true; if (g.st.u >= (p.speedUp ?? 27)) st.phase = 'brake'; } else k.left = g.st.u > g.startSpeed; }
  else if (!st.wingOn) { if (e === 'brake') k.left = g.st.om > 0; if (e === 'pump' && g.st.om > 0 && g.st.th > rad(-10)) k.up = true; }
  else if (g.l < 2.39 && p.polesOut) k.down = true;
  if (!st.wingOn && g.st.th > rad(p.wingAt ?? 40) && g.st.om > 0) { k.wing = true; st.wingOn = true; }
}


// ---- cross-span demos (task 4.5)
const CROSS_GOAL = 6;
function crossSetup(g) { if (g.world.bus.on) g.world.setBus(false); g.crossSpanOn = true; }
/** Ride with the poles at `len` m, pushing when `push`; let go `lead` s before the next support's hanger and reach for the wire once
 *  the tips are past it. The grip key is an edge: a press lets go on the wire, a second press in the air starts the reach. */
function dip(g, k, p, st, push) {
  const W = g.world;
  if (g.mode === 'wire') {
    k.right = push;
    if (g.l > p.len + 0.01) k.up = true; else if (g.l < p.len - 0.01) k.down = true;
    const next = W.spanX(Math.floor((g.st.x - 10) / W.SPAN) + 1);
    if (next - g.st.x < Math.max(0, g.st.u) * p.lead + 0.02 && !st.pressed) { k.grip = true; st.pressed = true; st.past = next; }
    else st.pressed = false;
  } else {
    st.pressed = false;
    if (g.tips()[0] > st.past + 0.08 && g.airTime > 0.16 && !g.reaching) k.grip = !st.gripped, st.gripped = !st.gripped; else st.gripped = false;
  }
}
/** The run ends as her tips pass the goal on the wire; the page stops there too. */
const crossStopped = (g) => g.mode === 'wire' && g.st.x >= g.world.spanX(CROSS_GOAL);

/** Time to the goal, sections caught on the way, top speed, and effort: coil work spent plus the work of pulling the poles in under load. */
function crossResult(g, trace) {
  const W = g.world, goal = W.spanX(CROSS_GOAL), reach = trace.findIndex((r) => r.tx >= goal), upto = reach < 0 ? trace : trace.slice(0, reach + 1);
  const caught = new Set(upto.filter((r) => r.mode === 'wire').map((r) => Math.ceil((r.tx - 10) / W.SPAN)));
  let all = true; for (let k = 0; k <= CROSS_GOAL; k++) if (!caught.has(k)) all = false;
  let effort = 0, top = 0; for (const r of upto) { effort += (Math.max(0, r.fCoil * r.u) + Math.max(0, -r.dl * r.tension)) * r.dt; top = Math.max(top, r.u); }
  const done = reach >= 0 && all && g.spanHits === 0 && !g.over;
  const air = upto.filter((r) => r.mode === 'air').reduce((a, r) => a + r.dt, 0), dips = upto.filter((r, i) => i && r.mode === 'air' && upto[i - 1].mode === 'wire').length;
  return { done, air: +air.toFixed(2), dips, t: reach >= 0 ? +upto[upto.length - 1].t.toFixed(2) : null, sections: `${[...caught].filter((k) => k >= 0 && k <= CROSS_GOAL).length}/${CROSS_GOAL + 1}`, effort: +(effort / 1000).toFixed(2), top: +(top * 3.6).toFixed(0) };
}

/** Her tips, head and tail in flight (narrow: the body in line with the poles). */
const flightParts = (f, LB) => [[f.x + f.l * Math.cos(f.phi), f.y + f.l * Math.sin(f.phi)], [f.x, f.y], [f.x - LB * Math.cos(f.phi), f.y - LB * Math.sin(f.phi)]];
/** Where a release now would take her, run ahead on a copy of the flight: idle, then the reach once all of her is past the
 *  support `sx` + 0.6 m, falling, with her head below `commit` m. Returns the lowest point at which any of her crosses the support's
 *  line, where she would catch the wire (null if she would not), and when. `ctl` is the air control (the wing for the flying demos). */
function lookAhead(g, sx, commit, ctl = {}, h = 0.002, dl = g.dl) {
  const F = g.F, f = F.release(g.st, g.l, dl);
  f.dry = true;
  let low = Infinity, t = 0, prev = null;
  const parts = (f) => flightParts(f, g.LB);
  const cross = (a, b) => ((a[0] - sx) * (b[0] - sx) <= 0 && a[0] !== b[0] ? a[1] + ((b[1] - a[1]) * (sx - a[0])) / (b[0] - a[0]) : null);
  for (; t < 4; t += h) {
    const pts = parts(f), past = Math.min(...pts.map((q) => q[0])) > sx + 0.6;
    const reach = t > 0.16 && past && f.vy < 0 && f.y < commit;
    for (const y of [cross(pts[0], pts[1]), cross(pts[1], pts[2])]) if (y != null) low = Math.min(low, y);
    if (prev) for (let n = 0; n < 3; n++) { const y = cross(prev[n], pts[n]); if (y != null) low = Math.min(low, y); }
    prev = pts;
    const got = F.step(f, { grip: reach, poleRate: 0, spread: !!ctl.spread && !reach, pitch: ctl.pitch ?? rad(25) }, h);
    if (got) return { low, x: got.x, t, hard: got.hard };
    if (f.y < -3) break;
  }
  return { low, x: null, t };
}
/** The launch as keys, for the game and for its twin: brake (hard if asked, while the pole load allows), pull the poles in
 *  through the bottom of the swing down to `pump` m (0: not at all), and let go at the first moment the look-ahead says the flight
 *  clears the support at `sx` (all of her above the cross-span) and lands on the wire before the next one. Returns the reach
 *  height it let go for, or null; 'over' once the swing has gone past the top with no clean release. */
function launchStep(g, k, p, sx, tick) {
  const load = g.out ? Math.abs(g.out.tension) : 0, easy = load < 800;                        // keep clear of the 1000 N the tips can hang
  k.left = true; k.hard = !!p.hard && easy; if (p.pump && easy && g.st.th > rad(-10) && g.l > p.pump) k.up = true;
  if (g.st.th > rad(200)) return 'over';
  if (g.st.th > rad(20) && g.st.om > 0 && tick % 5 === 0)
    for (const commit of [1.5, 0.5, 2.5]) {
      const f = lookAhead(g, sx, commit, {}, 0.002, k.up ? g.dl : 0);             // the pole rate the release step will have
      if (f.x != null && f.low > CROSS_SPAN_TOP + 0.1 && f.x > sx + 3 && f.x < sx + g.world.SPAN - 3) { k.grip = true; if (globalThis.DEMO_DEBUG && !g.twinOf) console.log('predict', g.t.toFixed(3), 'sx', sx, 'x', f.x.toFixed(2), 'low', f.low.toFixed(2), 'commit', commit, 'tx', g.st.x.toFixed(2), 'th', (g.st.th * 57.3).toFixed(1)); return commit; }   // beyond her poles' reach of the support, so no swing takes her back under it
    }
  return null;
}
/** Would a launch started now work, and which (brake and pump)? Tried out on the twin game: the same state, the launch run for up to 1.5 s. */
function launchWorks(g, st, p, sx) {
  for (const q of [p, { hard: true, pump: 1.2 }, { hard: true, pump: 1.4 }, { hard: false, pump: 1.2 }, { hard: true, pump: 1.0 }, { hard: true, pump: 0 }])   // the plan's own launch first
    if (launchTry(g, st, q, sx)) return q;
  return null;
}
function launchTry(g, st, p, sx) { return onTwin(g, st, (tw, k, i) => launchStep(tw, k, p, sx, i)); }
/** Run `fn(twin, keys, i)` on the twin game from the game's state for up to 1.5 s: true as soon as it returns a value, false on 'over'. */
function onTwin(g, st, fn) {
  const tw = (st.twin ??= Object.assign(g.twin(), { twinOf: true })), cmds = makeCommands({ ...g.level.input, balance: g.level.balance }), dt = g.level.tuning.step;
  if (tw.world.bus.on) tw.world.setBus(false);
  Object.assign(tw, { st: { ...g.st }, l: g.l, dl: g.dl, mode: 'wire', fl: null, over: null, t: g.t, out: g.out, reaching: false, crossSpanOn: false });
  if (g.shown) Object.assign(cmds.state, { accel: g.shown.accel ?? 0, poleRate: g.shown.poleRate ?? 0 });   // the throttle ramps from where the game's is
  for (let i = 0; i < 1500 && !tw.over && tw.mode === 'wire'; i++) {
    const k = {}, r = fn(tw, k, i);
    if (r === 'over') return false;
    if (r != null) return true;
    tw.step(cmds.update(k, dt), dt);
    if (globalThis.TWIN_DEBUG && i % 50 === 0) console.log('  twin', i, 'x', tw.st.x.toFixed(2), 'u', tw.st.u.toFixed(2), 'th', (tw.st.th * 57.3).toFixed(0), 'l', tw.l.toFixed(2), 'mode', tw.mode, tw.over || '');
  }
  return false;
}
/** Over the top: drive to `v` m/s with the poles out, the coils damping any swing a catch left; approaching a support, start the
 *  launch at the first moment the twin says it works; in the air, reach on the rule the look-ahead used. */
function hop(g, k, p, st, drive) {
  const W = g.world;
  st.tick = (st.tick ?? 0) + 1;
  if (g.mode === 'wire') {
    const next = W.spanX(Math.floor((g.st.x - 10) / W.SPAN) + 1), calm = Math.abs(g.st.th - rad(-8)) < rad(20) && Math.abs(g.st.om) < 1.5;
    if (st.launching !== next && next - g.st.x < 16 && g.st.u > 2 && st.tick % 20 === 0 && (st.how = launchWorks(g, st, p, next))) { st.launching = next; st.tick = 0; }
    if (st.launching === next) { const r = launchStep(g, k, st.how, next, st.tick); if (r === 'over') st.launching = 'gave up'; else if (r != null) { st.over = next; st.commit = r; } }
    else if (!calm) { k.right = g.st.om > 0; k.left = g.st.om < 0 && g.st.u > 2; if (g.l < 2.39) k.down = true; }   // the coils damp the swing a catch leaves: tips after the body
    else { k.right = drive; if (g.l < 2.39) k.down = true; }
  } else {
    const past = Math.min(...flightParts(g.fl, g.LB).map((q) => q[0])) > st.over + 0.6;
    if (past && g.fl.vy < 0 && g.fl.y < st.commit) k.grip = true;
  }
}
/** A flight run ahead on a copy, for the flying demos: the wing spread while her head is above `fold` m (and folded before she
 *  comes down through the wire plane, where a spread body strikes an arc), the reach once she is falling below `commit` m with all
 *  of her clear of every support by 0.6 m. Returns where she would catch the wire (null if not), whether any of her would cross a
 *  hanger (between the wire and the span, at a support), and how far she flew with the wing spread. */
function flyAhead(g, p, dl = g.dl, h = 0.002) {
  const F = g.F, W = g.world, f = F.release(g.st, g.l, dl), SP = W.SPAN;
  f.dry = true;
  let prev = null, bad = false, wingDist = 0, t = 0;
  const near = (x) => { const k = Math.round((x - 10) / SP); return Math.abs(x - W.spanX(k)) < 0.6; };
  for (; t < 6; t += h) {
    const pts = flightParts(f, g.LB);
    if (prev) for (let n = 0; n < 3; n++) {                                                 // any part crossing a support line between the wire and the span
      const [a, b] = [prev[n], pts[n]], k = Math.round((b[0] - 10) / SP), sx = W.spanX(k);
      if ((a[0] - sx) * (b[0] - sx) <= 0 && a[0] !== b[0]) { const y = a[1] + ((b[1] - a[1]) * (sx - a[0])) / (b[0] - a[0]); if (y > -0.1 && y < CROSS_SPAN_TOP + 0.05) bad = true; }
    }
    for (const [a, b] of [[pts[0], pts[1]], [pts[1], pts[2]]]) { const k = Math.round((a[0] - 10) / SP), sx = W.spanX(k);  // her poles or body straddling a support now
      if ((a[0] - sx) * (b[0] - sx) < 0) { const y = a[1] + ((b[1] - a[1]) * (sx - a[0])) / (b[0] - a[0]); if (y > -0.1 && y < CROSS_SPAN_TOP + 0.05) bad = true; } }
    prev = pts;
    const reach = t > 0.16 && f.vy < 0 && f.y < p.commit && !pts.some((q) => near(q[0]));
    const spread = f.y > p.fold && !reach;
    const x0 = f.x;
    const got = F.step(f, { grip: reach, poleRate: 0, spread, pitch: rad(p.pitch) }, h);
    if (spread) wingDist += Math.abs(f.x - x0);
    if (got) { const off = ((got.x - 10) % SP + SP) % SP; return { x: got.x, bad: bad || off < 3 || off > SP - 6, wingDist, t }; }   // not within 6 m before a support or 3 m after it
    if (f.y < -3) break;
  }
  return { x: null, bad: true, wingDist, t };
}
/** The flying launch: brake and pump as the hop does, and let go at the peak of the look-ahead's flight (farthest catch, nothing
 *  crossing a hanger). Returns 'over' when the swing has gone past the top, true on the release, null otherwise. */
function flyLaunchStep(g, k, p, st, tick) {
  const load = g.out ? Math.abs(g.out.tension) : 0, easy = load < 800;
  k.left = true; k.hard = !!p.hard && easy; if (p.pump && easy && g.st.th > rad(-10) && g.l > p.pump) k.up = true;
  if (g.st.th > rad(200)) return 'over';
  if (g.st.th > rad(20) && g.st.om > 0 && tick % 5 === 0) {
    const f = flyAhead(g, p, k.up ? g.dl : 0), x = f.x != null && !f.bad && f.x - g.st.x >= p.minFly && f.x > (p.past ?? -Infinity) + 3 ? f.x : -Infinity;   // over the next support at least
    if (x > -Infinity && x < (st.flyBest ?? -Infinity) - 0.3) { k.grip = true; st.flyBest = null; return true; }   // a good flight, just past the best: go   // past the peak: go
    st.flyBest = Math.max(st.flyBest ?? -Infinity, x);
  }
  return null;
}
/** Flying from a standstill to the 6th support: drive to `v` m/s, damp the swing; when the twin says a launch now gives a flight,
 *  launch and let go at the peak; in the air the wing and the reach as the look-ahead flew them. `lifted`: keep the wing on through
 *  the catch, so she rides the wire in the lifted gait (her body flying ahead of her tips) and launches from there. */
function fly(g, k, p, st) {
  st.tick = (st.tick ?? 0) + 1;
  if (g.mode === 'wire') {
    if (st.wingOn && !p.lifted) { k.wing = true; st.wingOn = false; }                    // folded on the wire unless riding lifted
    const W = g.world, next = W.spanX(Math.floor((g.st.x - 10) / W.SPAN) + 1);
    const calm = p.lifted && st.wingOn ? true : Math.abs(g.st.th - rad(-8)) < rad(20) && Math.abs(g.st.om) < 1.5;
    const pp = { ...p, past: next };
    if (st.launching !== next && next - g.st.x < 16 && g.st.u > 2 && st.tick % 20 === 0) {
      for (const q of [{}, { hard: true, pump: 1.4 }, { hard: false, pump: 1.2 }, { hard: true, pump: 1.0 }, { hard: true, pump: 0 }]) {   // the plan's own launch first
        const twinSt = {}, pq = { ...pp, ...q };
        if (onTwin(g, st, (tw, kk, i) => { const r = flyLaunchStep(tw, kk, pq, twinSt, i); return r === 'over' ? 'over' : r ? true : null; })) { st.launching = next; st.tick = 0; st.flyBest = null; st.how = q; break; }
      }
    }
    if (st.launching === next) { const r = flyLaunchStep(g, k, { ...pp, ...st.how }, st, st.tick); if (r === 'over') st.launching = 'gave up'; }
    else if (p.lifted && next - g.st.x > 16) goLifted(g, k, { entry: p.entry ?? 'brake', wingAt: 40, polesOut: true }, st);   // between supports: up into the lifted gait, her body flying
    else if (!calm) { k.right = g.st.om > 0; k.left = g.st.om < 0 && g.st.u > 2; if (g.l < 2.39) k.down = true; }
    else { k.right = g.st.u < p.v; if (g.l < 2.39) k.down = true; }
  } else {
    const W = g.world, pts = flightParts(g.fl, g.LB), near = pts.some((q) => { const kk = Math.round((q[0] - 10) / W.SPAN); return Math.abs(q[0] - W.spanX(kk)) < 0.6; });
    const reach = g.airTime > 0.16 && g.fl.vy < 0 && g.fl.y < p.commit && !near, spread = g.fl.y > p.fold && !reach;
    if (spread !== !!st.wingOn && !(p.lifted && reach)) { k.wing = true; st.wingOn = !st.wingOn; }
    if (st.wingOn) setPitch(k, st, p.pitch);
    if (reach) k.grip = true;
  }
}
/** Distance she covered off the wire with the wing spread, off the wire at all, and riding lifted, up to the goal, as shares of it. */
function flyResult(g, trace) {
  const W = g.world, goal = W.spanX(CROSS_GOAL), reach = trace.findIndex((r) => r.mode === 'wire' && r.tx >= goal), upto = reach < 0 ? trace : trace.slice(0, reach + 1);
  let wing = 0, air = 0, lifted = 0, airT = 0;
  for (let i = 1; i < upto.length; i++) { const r = upto[i], dx = Math.abs(r.hx - upto[i - 1].hx);
    if (r.mode === 'air') { air += dx; airT += r.dt; if (r.spread) wing += dx; } else if (r.lifted) lifted += dx; }
  const done = reach >= 0 && g.spanHits === 0 && !g.over, pc = (d) => Math.round((100 * d) / goal);
  return { done, t: reach >= 0 ? +upto[upto.length - 1].t.toFixed(2) : null, wing_pc: pc(wing), air_pc: pc(air), lifted_pc: pc(lifted), air_s: +airT.toFixed(1), flights: upto.filter((r, i) => i && r.mode === 'air' && upto[i - 1].mode === 'wire').length };
}

/** The lowest point at which any of her (tips, poles, body) crossed each support's line x = spanX(k), k = 0..CROSS_GOAL, over the
 *  run up to the goal: for the "over the top" demos, which may not pass under the hanger, every one must clear the cross-span. */
function crossings(g, trace) {
  const W = g.world, low = Array(CROSS_GOAL + 1).fill(Infinity);
  const at = (a, b, sx) => (a[0] - sx) * (b[0] - sx) <= 0 && a[0] !== b[0] ? a[1] + ((b[1] - a[1]) * (sx - a[0])) / (b[0] - a[0]) : null;
  for (let i = 1; i < trace.length; i++) {
    const r = trace[i], q = trace[i - 1];
    for (let k = 0; k <= CROSS_GOAL; k++) {
      const sx = W.spanX(k), ys = [at([r.hx, r.hy], [r.tx, r.ty], sx), at([r.hx, r.hy], [r.bx, r.by], sx),     // her poles and body across the line now
        at([q.tx, q.ty], [r.tx, r.ty], sx), at([q.hx, q.hy], [r.hx, r.hy], sx), at([q.bx, q.by], [r.bx, r.by], sx)];   // her tips, head, tail crossing it this step
      for (const y of ys) if (y != null) low[k] = Math.min(low[k], y);
    }
    if (r.mode === 'wire' && r.tx >= W.spanX(CROSS_GOAL)) break;
  }
  return low;
}

function overResult(g, trace, score) {
  const c = crossResult(g, trace), low = crossings(g, trace), clear = CROSS_SPAN_TOP, under = low.filter((y) => y < clear).length;
  const ok = c.done && under === 0;
  return { ok, time_s: c.t, effort_kJ: c.effort, top_kmh: c.top, span_hits: g.spanHits, sections: c.sections, hops: c.dips, under, lowest_m: low.map((y) => (y === Infinity ? null : +y.toFixed(2))).join(' '),
           score: ok ? score(c) : -99 - 5 * g.spanHits - under + 3 * (c.sections ? +c.sections.split('/')[0] : 0) };
}
const OVER_NOTE = 'Nothing of her may pass under a hanger, so at every support she hops over the cross-span: a hard brake that swings her body forward and up, her poles pulled in through the bottom of the swing, and a release at the moment a look-ahead says all of her will clear the span and land on the wire more than a pole length past it. A twin of the game tries the launch out on the approach and starts it at the first moment it works.';
const CROSS_SPAN_TOP = 0.6;   // the span's height plus its radius (base.yaml cross_span): below this at a support she went under
export const demos = {
  // ---- single moments -----------------------------------------------------------------------------------
  spun_down: {
    title: 'Spun down', kind: 'badge', what: 'the hoop, then opened, then a soft catch',
    params: { release: [58], commit: [1.6, 2.0] },
    plan(g, p) { const k = {}, geo = g.world.geom();
      if (g.mode === 'wire' && g.catches === 0) launch(g, k, p, geo);
      else if (g.mode === 'air') { if (g.fl.vy < 0 && g.fl.y < p.commit) k.grip = true; else k.up = true; }
      else cruise(g, k); return k; },
    closes(toks) { const c = has(toks, 'CURL'), o = c && after(toks, c, 'OPEN'), ca = o && after(toks, o, 'CATCH', (k) => k.kind === 'soft'); return { ok: !!ca, order: [c && 'CURL', o && 'OPEN', ca && 'CATCH.soft'].filter(Boolean).join(' → ') }; },
  },
  held_it: {
    title: 'Held it', kind: 'badge', what: 'a hard catch (over the absorption limit) survived under the body-load limit',
    params: { release: [58], commit: [3.0, 3.6, 4.2] },
    plan(g, p) { const k = {}, geo = g.world.geom();
      if (g.mode === 'wire' && g.catches === 0) launch(g, k, p, geo);
      else if (g.mode === 'air') { k.down = g.fl.l < 2.39; if (g.fl.vy < 0 && g.fl.y < p.commit) k.grip = true; }
      else cruise(g, k); return k; },
    closes(toks, g) { const c = has(toks, 'CATCH', (k) => k.kind === 'hard'); return { ok: !!c && !g.over?.includes('load'), note: 'the body-load limit is impossibly high for now (base.yaml), so any hard catch survives' }; },
  },
  through_the_arc: {
    title: 'Through the arc', kind: 'badge', what: 'arced between the wires, stayed on, and still passed the bus',
    params: { release: [58], commit: [1.6, 2.0] },
    plan(g, p, st) { const k = {}, geo = g.world.geom();
      if (g.mode === 'wire' && g.catches === 0) launch(g, k, p, geo);
      else if (g.mode === 'air') { if (g.arcs === 0 && !st.wingOn && g.fl.y < -0.3 && g.fl.vy > 0) { k.wing = true; st.wingOn = true; }   // spread just before her head crosses the wires: the arc
        if (g.arcs > 0 && g.fl.vy < 0 && g.fl.y < p.commit) k.grip = true; else if (g.arcs > 0) k.up = true; }
      else cruise(g, k); return k; },
    closes(toks, g) { const a = has(toks, 'ARC'), p = a && after(toks, a, 'PASS'); return { ok: !!p, arc: !!a }; },
  },
  short_pole_flight: {
    title: 'Short-pole flight', kind: 'badge', what: 'the lifted gait held for 2 s at the shortest pole length (free practice, no trolleybus: the bus ended the 1.5 s run of 2026-09-23, not the gait)',
    start: 'lifted', params: { speed: [22, 26, 30, 34], settle: [0.5, 1.5] },
    plan(g, p) { const k = {}; if (g.world.bus.on) g.world.setBus(false); if (g.mode === 'wire') { k.right = g.st.u < p.speed; k.up = g.t > p.settle && g.l > g.F.L_MIN + 0.01 && Math.abs(g.st.om) < 0.3; } return k; },
    closes(toks, g, trace) { let run = 0, best = 0; for (const s of trace) { if (s.mode === 'wire' && s.lifted && s.l <= g.F.L_MIN + 0.02) { run += s.dt; best = Math.max(best, run); } else run = 0; } return { ok: best >= 2, held_s: +best.toFixed(2), score: best }; },
  },
  hoop_over_roof: {
    title: 'Hoop over the roof', kind: 'badge', what: 'curled into the hoop with her head above the trolleybus',
    params: { release: [58], commit: [1.6] },
    plan(g, p) { const k = {}, geo = g.world.geom();
      if (g.mode === 'wire' && g.catches === 0) launch(g, k, p, geo);
      else if (g.mode === 'air') { if (g.fl.vy < 0 && g.fl.y < p.commit) k.grip = true; else k.up = true; }
      else cruise(g, k); return k; },
    closes(toks, g, trace) { const s = trace.find((x) => x.mode === 'air' && x.curl > 0.5 && x.overBus); return { ok: !!s, at_s: s && +s.t.toFixed(2) }; },
  },
  kiss: {
    title: 'Kiss', kind: 'badge', what: 'a catch with under 0.5 m/s of speed along the poles to absorb',
    params: { release: [45, 52, 58], commit: [0.6, 1.0, 1.4, 1.8, 2.2, 2.6, 3.0], polesOut: [true, false] },
    plan(g, p) { const k = {}, geo = g.world.geom();
      if (g.mode === 'wire' && g.catches === 0) launch(g, k, p, geo);
      else if (g.mode === 'air') { k.down = p.polesOut && g.fl.l < 2.39; if (g.fl.vy < 0 && g.fl.y < p.commit) k.grip = true; }
      else cruise(g, k); return k; },
    closes(toks, g, trace) { const c = trace.find((x) => x.catchAlong != null); return { ok: !!c && Math.abs(c.catchAlong) < 0.5, along_mps: c && +Math.abs(c.catchAlong).toFixed(2), score: c ? -Math.abs(c.catchAlong) : -99 }; },
  },

  // ---- lines (windows are events: BACK is the swing back through zero on the wire) --------------------------
  swoop: {
    title: 'Swoop', kind: 'line', what: 'REL → SPREAD → CATCH → LIFTED before the swing back (soft or hard catch: that is Kiss / Held it)',
    params: { release: [52, 58], pitch: [10, 16], commit: [1.4, 1.8], entry: ['brake', 'pump', 'coast', 'speed'], wingAt: [30, 40, 50], polesOut: [false, true] },
    plan(g, p, st) { const k = {}, geo = g.world.geom();
      if (g.mode === 'wire' && g.catches === 0) launch(g, k, p, geo);
      else if (g.mode === 'air') { glide(g, k, p, st); if (g.fl.vy < 0 && g.fl.y < p.commit) k.grip = true; }
      else { if (st.wingOn && !st.reset) { st.wingOn = false; st.reset = true; k.wing = true; } goLifted(g, k, p, st); } return k; },   // the reach folded her; the wing key is a toggle, so put it back to off, then on again on the forward swing
    closes(toks) { const r = has(toks, 'REL'), s = r && after(toks, r, 'SPREAD'), c = s && after(toks, s, 'CATCH'), l = c && after(toks, c, 'LIFTED', liftedEnter);
      const h = l && after(toks, l, 'LIFTED', (k) => k.phase === 'hold');
      return { ok: !!l && backsBetween(toks, c, l) === 0, got: [r && 'REL', s && 'SPREAD', c && 'CATCH.' + c.kind, l && 'LIFTED'].filter(Boolean).join(' → '), lifted_after_catch_s: l && +(l.t - c.t).toFixed(2), held_s: h ? h.seconds : l ? 'to the end' : null, score: h ? h.seconds : l ? 99 : 0 }; },
  },
  swoop_under: {
    title: 'Swoop below the wire', kind: 'line', what: 'REL → SPREAD → CATCH → LIFTED with her head never above the wires: a wing hop in the space under them, no trolleybus in the way (free practice)',
    bus: false,
    params: { release: [24, 32, 40, 48, 56], hard: [false, true], pitch: [8, 14], commit: [-0.3, -0.8, -1.3], entry: ['brake', 'coast'], wingAt: [30, 40], polesOut: [false, true] },
    plan(g, p, st) { const k = {};
      if (g.world.bus.on) g.world.setBus(false);
      if (g.mode === 'wire' && g.catches === 0) { st.go ??= g.t > 0.5; if (g.t > 0.5) { k.left = true; k.hard = p.hard; if (g.st.th >= rad(p.release)) k.grip = true; } }   // a brake on full-length poles, no pump: she must stay under the wires
      else if (g.mode === 'air') { if (!st.wingOn && g.fl.vy > 0) { k.wing = true; st.wingOn = true; } if (st.wingOn) setPitch(k, st, p.pitch); if (g.fl.vy < 0 && g.fl.y < p.commit) k.grip = true; }   // the wing goes on at once, under the wires
      else { if (st.wingOn && !st.reset) { st.wingOn = false; st.reset = true; k.wing = true; } goLifted(g, k, p, st); } return k; },
    closes(toks, g, trace) { const r = has(toks, 'REL'), s = r && after(toks, r, 'SPREAD'), c = s && after(toks, s, 'CATCH'), l = c && after(toks, c, 'LIFTED', liftedEnter);
      const top = Math.max(...toks.filter((k) => k.name === 'APEX').map((k) => k.height), -9), under = top < 0;
      return { ok: !!l && under && backsBetween(toks, c, l) === 0, got: [r && 'REL', s && 'SPREAD', c && 'CATCH.' + c.kind, l && 'LIFTED'].filter(Boolean).join(' → '), apex_m: +top.toFixed(2), score: (c ? 10 : 0) + (l ? 10 : 0) + (under ? 5 : 0) - Math.max(0, top) }; },
  },
  rolled_up: {
    title: 'Rolled up', kind: 'line', what: 'REL → CURL → OPEN → SPREAD → CATCH in one flight',
    params: { release: [58], openAt: [0.4, 0.6, 0.8], pitch: [12], commit: [1.4, 1.8] },
    plan(g, p, st) { const k = {}, geo = g.world.geom();
      if (g.mode === 'wire' && g.catches === 0) launch(g, k, p, geo);
      else if (g.mode === 'air') { const curled = (g.fl.curl || 0) > 0.5; if (curled) st.curled = true;
        if (!st.curled) k.up = true;
        else if (!st.wingOn && g.airTime > p.openAt && g.fl.y > 0.3) { k.wing = true; st.wingOn = true; }
        else if (st.wingOn) { setPitch(k, st, p.pitch); if (g.fl.vy < 0 && g.fl.y < p.commit) k.grip = true; } }
      else cruise(g, k); return k; },
    closes(toks) { const r = has(toks, 'REL'), c = r && after(toks, r, 'CURL'), o = c && after(toks, c, 'OPEN'), s = o && after(toks, o, 'SPREAD'), ca = s && after(toks, s, 'CATCH');
      return { ok: !!ca, got: [r && 'REL', c && 'CURL', o && 'OPEN', s && 'SPREAD', ca && 'CATCH.' + ca.kind].filter(Boolean).join(' → ') }; },
  },
  one_breath: {
    title: 'One breath', kind: 'line', what: 'PULL → REL → CATCH → PASS in under 3 s',
    params: { release: [58, 62], gap: [16.5, 14, 12] },
    plan(g, p) { const k = {}, geo = g.world.geom();   // the plain hop (was One press's plan, removed 2026-09-23)
      if (g.mode === 'wire' && g.catches === 0) launch(g, k, p, geo);
      else if (g.mode === 'air') { if (g.fl.l < 2.39 && !(g.fl.vy < 0)) k.down = true; if (g.fl.vy < 0 && g.fl.y < 1.4) k.grip = true; }
      else cruise(g, k); return k; },
    closes(toks) { const pu = has(toks, 'PULL'), r = pu && after(toks, pu, 'REL'), c = r && after(toks, r, 'CATCH'), pa = c && after(toks, c, 'PASS'); return { ok: !!pa && pa.t - pu.t < 3, breath_s: pa && +(pa.t - pu.t).toFixed(2) }; },
  },
  full_repertoire: {
    title: 'Full repertoire', kind: 'line', what: 'REL, CURL, OPEN, SPREAD, CATCH and LIFTED, in any order, within 6 s',
    params: { release: [58], openAt: [0.4, 0.6, 0.8], pitch: [12], commit: [1.4, 1.8], entry: ['brake', 'pump', 'coast', 'speed'], wingAt: [30, 40, 50], polesOut: [false, true] },
    plan(g, p, st) { if (g.mode === 'wire' && g.catches > 0) { const k = {}; if (st.wingOn && !st.reset) { st.wingOn = false; st.reset = true; k.wing = true; } goLifted(g, k, p, st); return k; } return demos.rolled_up.plan(g, p, st); },
    closes(toks) { const names = ['REL', 'CURL', 'OPEN', 'SPREAD', 'CATCH', 'LIFTED']; const got = names.map((n) => has(toks, n, (k) => n !== 'LIFTED' || liftedEnter(k))).filter(Boolean);
      const span = got.length === 6 ? Math.max(...got.map((k) => k.t)) - Math.min(...got.map((k) => k.t)) : null, l = has(toks, 'LIFTED', liftedEnter), h = l && after(toks, l, 'LIFTED', (k) => k.phase === 'hold');
      return { ok: got.length === 6 && span <= 6, got: got.map((k) => k.name).join(' '), span_s: span && +span.toFixed(2), held_s: h ? h.seconds : l ? 'to the end' : null, score: got.length + (h ? h.seconds : l ? 99 : 0) }; },
  },

  // ---- the cross-span (task 4.5, author 2026-09-27): from a standstill, bus off, cross-spans on, no wing and no lifted gait.
  // Her tips hit the hanger at every support, so she dips under each one: lets go just before it, drops a few centimetres,
  // and reaches back up just past it. The goal: her tips past the 6th support (220 m), the wire caught in every 35 m section.
  cross_ride: {
    title: 'Under the hangers', kind: 'cross', group: 'cross-span', start: 'still', tMax: 60,
    what: 'from a standstill to the 6th support at a steady 10 m/s, dipping under the hanger at every support',
    params: { target: [10], lead: [0.1, 0.12, 0.15], len: [2.0, 2.1, 2.2] },
    plan(g, p, st) { const k = {}; crossSetup(g); dip(g, k, p, st, g.mode === 'wire' && g.st.u < p.target); return k; },
    done: crossStopped,
    closes(toks, g, trace) { const c = crossResult(g, trace); return { ok: c.done, time_s: c.t, top_kmh: c.top, span_hits: g.spanHits, sections: c.sections, dips: c.dips, score: c.done ? -c.t : -99 - g.spanHits,
      note: 'Riding into a support her tips would meet the hanger, so at each one she lets go a tenth of a second or so before it, falls a few centimetres with her tips under the clamp, and reaches back for the wire once past it.' }; },
  },
  cross_fast: {
    title: 'Fastest, every section', kind: 'cross', group: 'cross-span', start: 'still', tMax: 40,
    what: 'the least time from a standstill to the 6th support, full thrust on the wire, dipping under every hanger',
    params: { lead: [0.08, 0.1, 0.12, 0.15], len: [1.9, 2.0, 2.1, 2.2] },
    plan(g, p, st) { const k = {}; crossSetup(g); dip(g, k, p, st, g.mode === 'wire'); return k; },
    done: crossStopped,
    closes(toks, g, trace) { const c = crossResult(g, trace); return { ok: c.done, time_s: c.t, top_kmh: c.top, span_hits: g.spanHits, sections: c.sections, dips: c.dips, air_s: c.air, score: c.done ? -c.t : -99 - g.spanHits,
      note: 'Every moment off the wire is a moment without thrust: seven dips keep her off it for 1.2 s in all. The shortest lead that works wins (a tenth of a second; less and the tips have not dropped clear of the clamp), with poles held at 2.1 m so the reach has room to find the wire again. Hopping over the spans was not searched: each would cost a brake and a release.' }; },
  },
  cross_easy: {
    title: 'Least effort', kind: 'cross', group: 'cross-span', start: 'still', tMax: 60,
    what: 'the least energy from a standstill to the 6th support within a minute, dipping under every hanger: coil work plus the work of pulling the poles in',
    params: { target: [5, 6, 7, 8, 10, 12], lead: [0.1, 0.12, 0.15], len: [2.0, 2.1, 2.2] },
    plan(g, p, st) { const k = {}; crossSetup(g); dip(g, k, p, st, g.mode === 'wire' && g.st.u < p.target); return k; },
    done: crossStopped,
    closes(toks, g, trace) { const c = crossResult(g, trace); return { ok: c.done, effort_kJ: c.effort, time_s: c.t, top_kmh: c.top, span_hits: g.spanHits, dips: c.dips, score: c.done ? -c.effort : -99 - g.spanHits,
      note: 'Held speeds of 5 to 12 m/s were tried; the cheapest was 6 m/s (2.3 kJ, 29 s). Each dip costs a little: after the catch her poles are longer and she pulls them back in under load before the next support. Faster costs more in drag and in the push to get up to speed.' }; },
  },

  // ---- over the top (task 4.6, author 2026-09-27): the same three, but nothing of her may pass under a hanger: at every support
  // she goes over the cross-span, all of her above it, and catches the wire beyond it.
  over_ride: {
    title: 'Over the spans', kind: 'cross', group: 'cross-span', start: 'still', tMax: 60,
    what: 'from a standstill to the 6th support, over the top of every cross-span, catching the wire in every section',
    params: { v: [12], hard: [true], pump: [1.2] },
    plan(g, p, st) { const k = {}; crossSetup(g); hop(g, k, p, st, g.mode === 'wire' && g.st.u < p.v); return k; },
    done: crossStopped,
    closes(toks, g, trace) { return { ...overResult(g, trace, (c) => -c.t), note: OVER_NOTE }; },
  },
  over_fast: {
    title: 'Over the spans, fastest', kind: 'cross', group: 'cross-span', start: 'still', tMax: 60,
    what: 'the least time from a standstill to the 6th support, over the top of every cross-span, full thrust on the wire between hops',
    params: { hard: [true, false], pump: [1.0, 1.2, 1.4] },
    plan(g, p, st) { const k = {}; crossSetup(g); hop(g, k, p, st, g.mode === 'wire'); return k; },
    done: crossStopped,
    closes(toks, g, trace) { return { ...overResult(g, trace, (c) => -c.t), note: OVER_NOTE + ' Every hop starts with a brake to almost nothing, so full thrust between them buys little.' }; },
  },
  over_easy: {
    title: 'Over the spans, least effort', kind: 'cross', group: 'cross-span', start: 'still', tMax: 60,
    what: 'the least energy from a standstill to the 6th support within a minute, over the top of every cross-span: coil work plus the work of pulling the poles in',
    params: { v: [6, 8, 10, 12, 15], hard: [true], pump: [1.2] },
    plan(g, p, st) { const k = {}; crossSetup(g); hop(g, k, p, st, g.mode === 'wire' && g.st.u < p.v); return k; },
    done: crossStopped,
    closes(toks, g, trace) { return { ...overResult(g, trace, (c) => -c.effort), note: OVER_NOTE + ' Approach speeds of 6 to 15 m/s were tried; below 12 m/s she never got over every span, and 12 costs less than 15, so this is the same run as Over the spans. Most of the effort is the pull on her poles through the bottom of each launch.' }; },
  },

  // ---- flying (task 4.6, author 2026-09-27): the same start and goal, the cross-spans on, no hits; the section rule dropped
  fly_wing: {
    title: 'Most on the wing', kind: 'cross', group: 'cross-span', start: 'still', tMax: 60,
    what: 'from a standstill to the 6th support flying as much of the way as she can with the wing spread, no cross-span met',
    params: { v: [14], hard: [true], pump: [1.2], pitch: [8, 14, 20], fold: [0.6, 1.5], commit: [0.4], minFly: [10] },
    plan(g, p, st) { const k = {}; crossSetup(g); fly(g, k, p, st); return k; },
    done: crossStopped,
    closes(toks, g, trace) { const c = flyResult(g, trace); return { ok: c.done, ...c, done: undefined, span_hits: g.spanHits, score: c.done ? c.wing_pc + c.air_pc / 100 : -99 + c.wing_pc / 100,
      note: 'The wing goes on only above the wires and comes off before she drops back through them; she lets go at the moment the look-ahead says the flight reaches farthest.' }; },
  },
  fly_most: {
    title: 'Most in the air', kind: 'cross', group: 'cross-span', start: 'still', tMax: 60,
    what: 'from a standstill to the 6th support with her body in the air as much of the way as it can be, by any means: flights with the wing, and the lifted gait between them',
    params: { v: [10, 14], hard: [true], pump: [1.2], pitch: [8, 14], fold: [1.5], commit: [0.4], minFly: [10], lifted: [false, true], entry: ['pump'] },
    plan(g, p, st) { const k = {}; crossSetup(g); fly(g, k, p, st); return k; },
    done: crossStopped,
    closes(toks, g, trace) { const c = flyResult(g, trace); return { ok: c.done, ...c, done: undefined, span_hits: g.spanHits, score: c.done ? c.air_pc + c.lifted_pc : -99 + (c.air_pc + c.lifted_pc) / 100,
      note: 'In the air counts her time off the wire and her time riding it lifted, her weight on the wing. Riding lifted between supports was searched too (the pump entry into the lifted gait); it held for at most 7 % of the way and every such run ended on a cross-span, so the best is all flights.' }; },
  },
};

/** Every combination of a candidate's parameter grid. */
export function grid(params) {
  const keys = Object.keys(params); let out = [{}];
  for (const k of keys) out = out.flatMap((p) => params[k].map((v) => ({ ...p, [k]: v })));
  return out;
}
export const freshState = () => ({ wingOn: false, pitch: 25 });

// the cross-span demos set their world up before the first step (bus off, cross-spans on), so a replay of their recorded keys needs no plan
for (const d of Object.values(demos)) if (d.group === 'cross-span') d.setup ??= crossSetup;
/** Keys as a bitmask, for recorded key timelines (tools/demo.mjs writes them, the page plays them back). */
export const KEY_ORDER = ['left', 'right', 'up', 'down', 'grip', 'flare', 'wing', 'pitchUp', 'pitchDown', 'hard', 'slow'];
export const keysToMask = (k) => KEY_ORDER.reduce((m, name, i) => m | (k[name] ? 1 << i : 0), 0);
export const maskToKeys = (m) => Object.fromEntries(KEY_ORDER.map((name, i) => [name, !!(m & (1 << i))]));
