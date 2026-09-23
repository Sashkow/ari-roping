// SPDX-License-Identifier: GPL-3.0-or-later
// Candidate badges and lines as demos (tasks 12.2 and 12.3): each is a scripted key driver, like the
// autopilots, with a few parameters that tools/demo.mjs searches, and a `closes` check on the token
// stream that says whether the shape happened. Nothing here is a badge: the author picks from the demos.
// A plan returns the `keys` object of input.js for the current game state; `p` holds the parameters.
import { rad } from './util.js';

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
};

/** Every combination of a candidate's parameter grid. */
export function grid(params) {
  const keys = Object.keys(params); let out = [{}];
  for (const k of keys) out = out.flatMap((p) => params[k].map((v) => ({ ...p, [k]: v })));
  return out;
}
export const freshState = () => ({ wingOn: false, pitch: 25 });
