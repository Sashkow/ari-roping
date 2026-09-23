// How fast can she leave the wire at 45 degrees, with nothing but the game's controls?
// Differential evolution over piecewise-constant commands (tip acceleration, pole rate, body pitch), played
// through the game's own physics and limits: the radio's full stick (twice throttle_full, no ramp), pole_speed,
// the pole lengths, the arc when she crosses the wire plane spread, the trolleybus's shoes ahead of her tips.
//   node tools/max_launch.mjs [--angle pole|path] [--deg 45] [--horizon 3.5] [--nobus] [--seed 1] [--gens 1200] [--out file.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { makePhysics, MODE } from '../src/physics.js';
import { makeGame } from '../src/game.js';
import { makeFlight } from '../src/flight.js';
import { makeWorld } from '../src/world.js';

const T_GRIP = Infinity, T_HANG = Infinity;
const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i < 0 ? dflt : process.argv[i + 1] ?? true; };
const ANGLE = arg('angle', 'pole'), DEG = +arg('deg', 45), HORIZON = +arg('horizon', 3.5), NOBUS = process.argv.includes('--nobus');
const SEG = +arg('seg', 0.125), GENS = +arg('gens', 1200), POP = +arg('pop', 90), OUT = arg('out', null);
const GRIP = +arg('grip', T_GRIP), HANG = +arg('hang', T_HANG), LOAD_G = +arg('loadg', Infinity);   // the level's limits unless given: candidates 450, 700, 14
let seed = +arg('seed', 1);
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

const { physics } = JSON.parse(readFileSync(new URL('../data/constants.json', import.meta.url)));
const level = JSON.parse(execFileSync(process.env.PYTHON || '/opt/ro/venv/bin/python', ['-c',
  'import json,yaml,sys; print(json.dumps(yaml.safe_load(open(sys.argv[1]))))', new URL('../levels/base.yaml', import.meta.url).pathname]));
const T = level.tuning, P = makePhysics({ ...physics, tuning: T }), DT = T.step;
const A_FULL = level.input.throttle_full * 2, POLE_V = level.input.pole_speed, L_MIN = physics.poles.short, L_MAX = physics.poles.long;
const SIMPLE = process.argv.includes('--simple'), HEIGHT = arg('objective', 'speed') === 'height';   // height: needs --simple
const LATE = +arg('late', 0.025), MARGIN = +arg('margin', 0), WORLD = makeWorld(physics, level);   // m she keeps between her tips and the shoes
const F = makeFlight(P, physics, T), COURSE_MAX = +arg('coursemax', 1.75);   // rad; a low ceiling forces the flat launch and the climb on the wing
const K = Math.round(HORIZON / SEG), DIM = SIMPLE ? (HEIGHT ? 12 : 7) : 3 * K, TARGET = (DEG * Math.PI) / 180, TWO_PI = 2 * Math.PI;
const start = makeGame(physics, level).st;

const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const command = (x, k) => ({ accel: clamp(x[3 * k], -1, 1) * A_FULL, poleRate: clamp(x[3 * k + 1], -1, 1) * POLE_V,
                             pitch: clamp(x[3 * k + 2], -0.3, 1) * (Math.PI / 2) });   // pitch <= 0: narrow

// --simple: one swing a player can fly. Run the tips up at a1 for tAcc, then brake at a2; a flare of tFlare at the start of
// the brake; poles in at full rate once she has swung past thPull, and let go when her course reaches the target angle.
const unit = (v, a, b) => a + ((clamp(v, -1, 1) + 1) / 2) * (b - a);
const recipe = (x) => ({ tAcc: unit(x[0], 0, 2.5), a1: unit(x[1], 0, A_FULL), a2: unit(x[2], -A_FULL, 0), thPull: unit(x[3], -1.6, 1.7), pull: unit(x[6], 0, POLE_V), tFlare: unit(x[4], 0, 0.6), lStart: unit(x[5], L_MIN, L_MAX),
  course: unit(x[7] ?? 0, 0.03, COURSE_MAX), wingAbove: unit(x[8] ?? 0, 0.4, 6), wingFor: unit(x[9] ?? 0, 0, 6), wingPitch: unit(x[10] ?? 0, 0.03, 0.62), hoop: (x[11] ?? 0) > 0 });
function simpleCommand(r, t, st, l) {
  if (t < r.tAcc) return { accel: r.a1, poleRate: Math.sign(r.lStart - l) * Math.min(POLE_V, Math.abs(r.lStart - l) / DT), pitch: 0 };
  return { accel: r.a2, poleRate: st.th > r.thPull ? -r.pull : 0, pitch: t < r.tAcc + r.tFlare ? Math.PI / 2 : 0 };
}

/** Play the commands; return the best instant to let go, the one with the target angle and the highest speed. */
function play(x, trace) {
  const r = SIMPLE ? recipe(x) : null; let lateAt = Infinity, lastDl = 0;
  const st = { ...start }; let l = L_MAX, arcUntil = -1, best = null, shoes = level.bus.first_gap, peakG = 0, peakT = 0;
  for (let i = 0, n = K * Math.round(SEG / DT); i < n; i++) {
    const t = i * DT, c = SIMPLE ? simpleCommand(r, t, st, l) : command(x, Math.min(K - 1, Math.floor(t / SEG)));
    const l0 = l; l = clamp(l + c.poleRate * DT, L_MIN, L_MAX); const dl = (l - l0) / DT; lastDl = dl;
    const spread = c.pitch > 0.03 * (Math.PI / 2) && t >= arcUntil;
    const y0 = -l0 * Math.cos(st.th), th0 = st.th;
    const mode = spread ? MODE.body : MODE.narrow, lvl = spread ? c.pitch : 0;
    const lim = P.limitTipAccel(st.th, st.om, st.u, c.accel, l, dl, mode, lvl, GRIP);
    const aP = st.u <= 0.5 && lim.aP < 0 ? 0 : lim.aP;
    const out = P.stepAttached(st, { aP, l, dl, mode, level: lvl }, DT);
    if (Math.abs(out.tension) > HANG || Math.abs(out.tension) > LOAD_G * P.M * P.G) break;   // she loses the wire, or it is more than her body takes
    if (spread && y0 * -l * Math.cos(st.th) < 0) arcUntil = t + T.arc_seconds;
    shoes += level.bus.speed * DT;
    if (!NOBUS && st.x > shoes - 0.12 - MARGIN && st.u > level.bus.speed) break;          // her tips are at the shoes: too late
    const sin = Math.sin(st.th), cos = Math.cos(st.th);
    const vx = st.u + l * st.om * cos + dl * sin, vy = l * st.om * sin - dl * cos, v = Math.hypot(vx, vy);
    const load = Math.abs(out.tension) / (P.M * P.G); if (load > peakG) { peakG = load; peakT = out.tension; }
    if (trace) trace.push({ t, th: st.th, om: st.om, u: st.u, l, aP, dl, spread, pitch: c.pitch, vx, vy, T: out.tension });
    if (HEIGHT) {        // let go once her course has risen to the recipe's angle, then fly it out to the top
      // scored on the worse of two releases, on the instant and LATE seconds after it: no player, and not the game's own
      // one-step lag, hits a single millisecond (the last one of the pull-in adds the whole pull speed to her launch)
      if (!best && t > r.tAcc && st.om > 0 && vy > 0 && Math.atan2(vy, vx) >= r.course) { best = { ...climb(F.release(st, l, dl), r, shoes), vx, vy, t, th: st.th, om: st.om, u: st.u, l, dl, x: st.x, peakG, peakT }; lateAt = t + LATE; }
      else if (best && t >= lateAt) { const late = climb(F.release(st, l, dl), r, shoes); best.onTime = best.v; best.v = Math.min(best.v, late.v); break; }
      continue;
    }
    if (vx <= 0 || vy <= 0) continue;
    let ok;
    if (ANGLE === 'pole') { const a = ((th0 % TWO_PI) + TWO_PI) % TWO_PI, b = a + (st.th - th0); ok = (a - TARGET) * (b - TARGET) <= 0 && st.om > 0; }
    else ok = Math.abs(Math.atan2(vy, vx) - TARGET) < 0.004 && (!SIMPLE || (st.th > 0 && st.th < 2.1 && st.om > 0));
    if (ok && (!best || v > best.v)) best = { v, vx, vy, t, th: st.th, om: st.om, u: st.u, l, dl, x: st.x, peakG, peakT };
  }
  // the run ended (her load limit, the shoes) before the late release came up: the late release is where it ended
  if (HEIGHT && best && best.onTime === undefined) { best.onTime = best.v; best.v = Math.min(best.v, climb(F.release(st, l, lastDl), r, shoes).v); }
  return best;
}
/** The flight up to its top: the wing open from wingFrom for wingFor at wingPitch, or rolled into the hoop. v is the height of the top above the wires. */
function climb(f, r, shoes) {
  let arcUntil = -1, t = 0, top = f.y, opened = null;
  for (; t < 12 && (f.vy > 0 || t < 0.05); t += DT) {
    if (opened == null && f.y > r.wingAbove) opened = t;           // the wing opens once she is well clear above the wires, never in the wire plane
    const y0 = f.y, want = opened != null && t < opened + r.wingFor && t >= arcUntil;
    F.step(f, { grip: false, poleRate: r.hoop && !want ? -POLE_V : 0, spread: want, pitch: r.wingPitch }, DT);
    if (f.spreadNow && y0 * f.y < 0) arcUntil = t + T.arc_seconds;
    top = Math.max(top, f.y);
    if (!NOBUS) {                                                        // wherever her body points: her head stays a body length and more from the trolleybus's poles, and a ring of points about it from the rest
      shoes += level.bus.speed * DT; WORLD.bus.shoes = shoes;
      const gm = WORLD.geom(), ax = gm.poleBase, ay = gm.roofY + 0.2, dx = gm.shoes - ax, dy = -ay;
      const k = clamp(((f.x - ax) * dx + (f.y - ay) * dy) / (dx * dx + dy * dy), 0, 1);
      if (Math.hypot(f.x - ax - k * dx, f.y - ay - k * dy) < 1.0 || WORLD.hit(RING.map(([cx, cy]) => [f.x + cx, f.y + cy]))) return { v: 0, climbTime: t, hit: true };
    }
  }
  return { v: top, climbTime: t };
}
const RING = [[0, 0], ...Array.from({ length: 12 }, (_, i) => [0.8 * Math.cos(i * Math.PI / 6), 0.8 * Math.sin(i * Math.PI / 6)])];
const score = (x) => { const b = play(x); return b ? b.v : 0; };

// differential evolution, rand-to-best/1/bin
let pop = Array.from({ length: POP }, () => Array.from({ length: DIM }, () => rnd() * 2 - 1));
let fit = pop.map(score), bi = fit.indexOf(Math.max(...fit));
for (let gen = 0; gen < GENS; gen++) {
  for (let i = 0; i < POP; i++) {
    let a, b; do a = Math.floor(rnd() * POP); while (a === i); do b = Math.floor(rnd() * POP); while (b === i || b === a);
    const F = 0.4 + rnd() * 0.5, CR = 0.3 + rnd() * 0.6, jr = Math.floor(rnd() * DIM);
    const y = pop[i].map((xi, j) => (rnd() < CR || j === jr ? clamp(xi + F * (pop[bi][j] - xi) + F * (pop[a][j] - pop[b][j]), -1, 1) : xi));
    const f = score(y);
    if (f >= fit[i]) { pop[i] = y; fit[i] = f; if (f > fit[bi]) bi = i; }
  }
  if (gen % 100 === 0) console.error(`gen ${gen}: ${fit[bi].toFixed(2)} m/s`);
}

const trace = [], best = play(pop[bi], trace), deg = (r) => (r * 180) / Math.PI;
const plan = SIMPLE ? recipe(pop[bi]) : Array.from({ length: K }, (_, k) => command(pop[bi], k)).filter((_, k) => k * SEG <= best.t)
  .map((c, k) => ({ t: +(k * SEG).toFixed(3), accel: +c.accel.toFixed(1), poleRate: +c.poleRate.toFixed(1), pitchDeg: c.pitch > 0.047 ? +deg(c.pitch).toFixed(0) : 0 }));
const report = { limits: { grip: GRIP, hang: HANG, loadG: LOAD_G }, angle: ANGLE, deg: DEG, horizon: HORIZON, bus: !NOBUS, start: { u: start.u, thDeg: deg(start.th) },
  release: { ...best, thDeg: deg(best.th), pathDeg: deg(Math.atan2(best.vy, best.vx)), kmh: Math.hypot(best.vx, best.vy) * 3.6, launchSpeed: Math.hypot(best.vx, best.vy), overStart: best.v / start.u, overTips: best.v / best.u,
             apexAboveWire: -best.l * Math.cos(best.th) + (best.vy * best.vy) / (2 * P.G) }, plan };
console.log(JSON.stringify(report, null, 1));
if (OUT) writeFileSync(OUT, JSON.stringify({ report, trace: trace.filter((_, i) => i % 10 === 0 && _.t <= best.t) }));
