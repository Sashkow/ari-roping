// The token stream: what she did, as transitions of the run's state, each with its time and numbers.
// Pure: fed the game after every step, returns the tokens of that step. Lines (design decision 15) are
// matched on this stream, the tab's `#` lines are printed from it, and a demo's key moments are it.
// Windows for lines are events, not clocks: BACK marks the pole angle passing back through zero on the
// wire, so "before the swing back" is "before the next BACK".
import { rad } from './util.js';

const HOLD = 0.05;               // s a body state has to last before it counts (a flicker is not a token)
const PULL_MIN = 0.3;            // m the poles must shorten in one pull before PULL counts
const LIFTED_SHARE = 0.6;        // lift over weight above which, spread and ahead of her tips, she is in the lifted gait
const LIFTED_HOLD = 0.2;         // s that has to last before LIFTED.enter

export function makeTokens(g, level) {
  const engage = rad(level.balance ? level.balance.engage_deg : 35), T = level.tuning;
  const s = { mode: g.mode, spread: false, spreadSince: -1, spreadLift: 0, flare: false, curl: 0, reaching: false, vy: 0, turns: 0, arcs: 0,
              lifted: false, liftedSince: -1, liftedFrom: 0, pullFrom: null, pulling: false, th: g.st ? g.st.th : 0, over: false, passed: false, tension: 0, releases: 0 };
  const out = [];
  let hx = 0, hy = 0;
  const tok = (name, numbers = {}, note = '') => out.push({ t: +g.t.toFixed(3), name, ...numbers, note, x: +hx.toFixed(2), y: +hy.toFixed(2) });

  function step(cmd) {
    out.length = 0;
    [hx, hy] = g.head(); const [vx, vy] = g.velocity(), shown = g.shown || cmd, geo = g.world.geom();
    // wire <-> air
    if (s.mode === 'wire' && g.mode === 'air') {
      tok('REL', { kind: Math.abs(s.tension) > T.hang_limit ? 'forced' : 'hand', speed: +(Math.hypot(vx, vy) * 3.6).toFixed(0), angle: +(s.th * 180 / Math.PI).toFixed(0), l: +g.fl.l.toFixed(2) }, 'let go');
      s.vy = vy; s.turns = 0; s.curl = 0; s.over = false;
    } else if (s.mode === 'air' && g.mode === 'wire') {
      tok('CATCH', { kind: g.hardCatch ? 'hard' : 'soft', speed: +(g.st.u * 3.6).toFixed(0), l: +g.l.toFixed(2), angle: +(g.st.th * 180 / Math.PI).toFixed(0) }, g.hardCatch ? 'a hard catch' : 'caught the wire');
      s.lifted = false; s.liftedSince = -1;
    }
    s.mode = g.mode;
    if (g.mode === 'wire' && g.out) {
      // the swing back: pole angle through zero going backward (the window marker of the lines)
      if (s.th > 0 && g.st.th <= 0 && g.st.om < 0) tok('BACK', { speed: +(g.st.u * 3.6).toFixed(0) }, 'swung back behind her tips');
      s.th = g.st.th; s.tension = g.out.tension;
      // the pull: poles shortening, counted once per pull if it moved them enough
      if (g.dl < -0.01) { if (!s.pulling) { s.pulling = true; s.pullFrom = g.l; } }
      else if (s.pulling) { s.pulling = false; if (s.pullFrom - g.l >= PULL_MIN) tok('PULL', { from: +s.pullFrom.toFixed(2), to: +g.l.toFixed(2) }, 'pulled the poles in'); }
      // the lifted gait: spread, well ahead of her tips, the wing carrying most of her weight
      const inLift = shown.spread && g.st.th > engage && g.out.lift / g.P.W > LIFTED_SHARE;
      if (inLift && !s.lifted) { if (s.liftedSince < 0) s.liftedSince = g.t; if (g.t - s.liftedSince >= LIFTED_HOLD) { s.lifted = true; s.liftedFrom = s.liftedSince; tok('LIFTED', { phase: 'enter', speed: +(g.st.u * 3.6).toFixed(0), lead: +(g.st.th * 180 / Math.PI).toFixed(0), lift: +((100 * g.out.lift) / g.P.W).toFixed(0) }, 'flying ahead of her tips'); } }
      else if (!inLift) { if (s.lifted) { s.lifted = false; tok('LIFTED', { phase: 'hold', seconds: +(g.t - s.liftedFrom).toFixed(2) }, 'held the lifted gait'); } s.liftedSince = -1; }
      if (g.passedAt != null && !s.passed) { s.passed = true; tok('PASS', { speed: +(g.st.u * 3.6).toFixed(0) }, 'past the trolleybus, on the wire'); }
    } else if (g.mode === 'air' && g.fl) {
      if (s.vy > 0 && vy <= 0) tok('APEX', { height: +hy.toFixed(2), speed: +(Math.hypot(vx, vy) * 3.6).toFixed(0) }, 'the top of the flight');
      s.vy = vy;
      const turns = Math.floor(Math.abs(g.turns)); if (turns > s.turns) { s.turns = turns; tok('TURN', { n: turns * Math.sign(g.turns) }, `${turns} full turn${turns > 1 ? 's' : ''}`); }
      const curl = g.fl.curl || 0;
      if (curl >= 0.5 && s.curl < 0.5) tok('CURL', { spin: +(g.F.spin(g.fl) / (2 * Math.PI)).toFixed(1) }, 'curled into the hoop');
      if (curl < 0.5 && s.curl >= 0.5) tok('OPEN', {}, 'opened out of the hoop');
      s.curl = curl;
      if (g.reaching && !s.reaching) tok('REACH', { height: +hy.toFixed(2) }, 'reached for the wire');
      s.reaching = g.reaching;
      if (g.world.bus.on && !s.over && hx > geo.front && hy > g.world.roofY) { s.over = true; tok('OVER', { height: +(hy - g.world.roofY).toFixed(2) }, 'over the windscreen, in the air'); }
    }
    // body, in either state: spread and narrow count once they have lasted, flare on its own
    const spread = !!shown.spread && !g.arcing();
    if (spread !== s.spread) { s.spread = spread; s.spreadSince = g.t; s.spreadLift = 0; }
    if (g.mode === 'wire' && g.out && spread) s.spreadLift += g.out.lift;
    if (s.spreadSince >= 0 && g.t - s.spreadSince >= HOLD) { tok(spread ? 'SPREAD' : 'NARROW', spread ? { pitch: +((shown.pitch || 0) * 180 / Math.PI).toFixed(0) } : {}, spread ? 'spread as a wing' : 'narrow'); s.spreadSince = -1; }
    const flare = !!shown.flare && spread; if (flare && !s.flare) tok('FLARE', {}, 'flared'); s.flare = flare;
    if (g.arcs > s.arcs) { s.arcs = g.arcs; tok('ARC', { seconds: T.arc_seconds }, 'an arc between her and the wire'); }
    return out;
  }
  return { step };
}

/** One line of text per token, as the tab prints them. */
export function tokenLine(k) {
  const nums = Object.entries(k).filter(([a]) => !['t', 'name', 'note', 'phase', 'kind', 'x', 'y'].includes(a)).map(([a, b]) => `${a} ${b}`).join(', ');
  return `# ${k.t.toFixed(3)} ${k.name}${k.phase ? '.' + k.phase : ''}${k.kind ? '.' + k.kind : ''}${nums ? '  ' + nums : ''}`;
}
