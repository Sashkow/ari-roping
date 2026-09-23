// SPDX-License-Identifier: GPL-3.0-or-later
// The page: keyboard in, fixed-step game, canvas and readouts out. `#watch` lets the autopilot play.
import { makeGame } from './game.js';
import { makeCommands } from './input.js';
import { makeClock } from './loop.js';
import { makeRenderer } from './render.js';
import { autopilots } from './autopilot.js';
import { deg } from './util.js';
import { readPad, movedControl, snapshot, defaultMappingFor } from './gamepad.js';
import { demos, freshState } from './demos.js';
import { makeSound } from './sound.js';

const KEYMAP = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', ' ': 'grip', f: 'flare', F: 'flare', g: 'wing', G: 'wing',
                 w: 'pitchUp', W: 'pitchUp', s: 'pitchDown', S: 'pitchDown', Shift: 'hard', Tab: 'slow' };

export function boot(data, doc) {
  const $ = (id) => doc.getElementById(id), level = data.levels[0], dt = level.tuning.step;
  let game, cmds, clock, renderer, keys = {}, paused = false, busOn = !/[#&]nobus/.test(location.hash), lifted = /[#&]lifted/.test(location.hash), assist = null,
      scale = +(/[#&]speed=([\d.]+)/.exec(location.hash) || [0, level.input.time_scale ?? 1])[1], watch = /[#&]watch/.test(location.hash), last = performance.now(), cmd;
  // ---- a demo (#demo=<id>): a candidate of demos.js played by its plan, with its key moments numbered (tasks 12.1, 11.3)
  const demoId = (/[#&]demo=(\w+)/.exec(location.hash) || [])[1], demo = demoId && data.demos && data.demos[demoId] && demos[demoId] ? { ...data.demos[demoId], plan: demos[demoId].plan } : null;
  let demoState = freshState(), stopAtMoments = false, moment = -1, seeking = false;
  // ---- the sound of her tips: off until the player picks a variant (browsers want a click before audio)
  let sound = null, soundCtx = null;
  const soundWant = (/[#&]sound=(synth|laz)/.exec(location.hash) || [])[1];
  async function soundBuffers() {
    if (!data.sounds) return null;
    const dec = async (b64) => soundCtx.decodeAudioData(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer);
    return { motor: await dec(data.sounds.motor), chopper: await dec(data.sounds.chopper) };
  }
  async function setSound(variant) {
    if (variant === 'off') { if (sound) sound.mute(); sound = null; $('soundStatus').textContent = 'off'; return; }
    if (!soundCtx) soundCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (soundCtx.state === 'suspended') await soundCtx.resume();
    if (!sound) { let buffers = null; try { buffers = await soundBuffers(); } catch (e) { $('soundStatus').textContent = `the recordings did not decode: ${e.message}`; }
      sound = makeSound(soundCtx, { variant, buffers, coilRating: (data.physics.tips || {}).coil ? data.physics.tips.coil.thrust : 40 }); }
    sound.set(variant);
  }
  const moments = demo ? demo.tokens.filter((k) => k.name !== 'BACK') : [];
  const label = (k) => `${k.name}${k.phase ? '.' + k.phase : ''}${k.kind ? '.' + k.kind : ''}`;
  const numbersOf = (k) => Object.entries(k).filter(([a]) => !['t', 'name', 'note', 'phase', 'kind', 'x', 'y'].includes(a)).map(([a, b]) => `${a} ${b}`).join(', ');
  function drawMoments() {
    if (!demo) return;
    $('moments').replaceChildren(...moments.map((k, i) => { const b = doc.createElement('button'), n = doc.createElement('b'), t = doc.createElement('span'); n.textContent = String(i + 1); t.textContent = `${k.t.toFixed(2)} s ${label(k)}`; b.append(n, t);
      b.className = i === moment ? 'on' : i < moment ? 'passed' : ''; b.addEventListener('click', () => seek(i)); return b; }));
    const k = moments[moment]; $('momentCard').hidden = !(paused && k); if (k) $('momentCard').textContent = `${moment + 1}. ${k.t.toFixed(2)} s, ${label(k)}: ${k.note}${numbersOf(k) ? '. ' + numbersOf(k) : ''}`;
  }
  /** Replay the demo from the start up to moment i and hold there. */
  function seek(i) {
    if (!demo) return; restart(); seeking = true; const k = moments[i];
    for (let n = 0; n < k.t / dt + 0.5 && !game.over; n++) { cmd = cmds.update(demo.plan(game, demo.params, demoState), dt); game.step(cmd, dt); if (game.won && game.over) { game.over = null; game.passedAt = Infinity; } if (game.events.includes('arc')) cmds.cancelSpread(); }
    seeking = false; moment = i; paused = true; renderer.snap(game); drawMoments();
  }
  const marks = () => moments.map((k, i) => ({ x: k.x, y: k.y, n: i + 1, current: i === moment })).filter((m, i) => moments[i].t <= game.t + 1e-9);
  // ---- a radio or gamepad: polled once a frame; its reading rides along into every physics step of that frame
  const FUNCS = [['speed', 'tip speed: brake / speed up'], ['pole', 'pole length: up pulls in'], ['lift', 'lift: wing and its pitch, by stick position'], ['grip', 'connect / disconnect her poles (one press)'], ['assist', 'automatic stabilisation on / off (one press)'], ['wing', 'wing on / off, like G (optional: the lift stick already does it)'], ['flare', 'flare, while held (optional: the top of the lift stick already is the flare)']];
  const PAD_DEFAULT = defaultMappingFor(navigator.userAgent), PAD_KEY = 'roping-pad-mapping-v6';      // browsers number the radio's axes differently
  let mapping = structuredClone(PAD_DEFAULT.mapping), padRead = null, assigning = null, padShown = false, prevPadAssist = false;
  try { const saved = JSON.parse(localStorage.getItem(PAD_KEY) || 'null'); if (saved && saved.speed) mapping = { ...mapping, ...saved }; } catch (e) { /* storage blocked: defaults */ }
  const saveMapping = () => { try { localStorage.setItem(PAD_KEY, JSON.stringify(mapping)); } catch (e) { /* session only */ } };
  const thePad = () => { const pads = (navigator.getGamepads ? [...navigator.getGamepads()] : []).filter(Boolean); return pads.find((p) => /radiomaster|edgetx|opentx|tx12|frsky|joystick/i.test(p.id)) || pads[0] || null; };
  function drawMapping() {
    const box = $('padMap'); box.replaceChildren();
    for (const [key, label] of FUNCS) {
      const ms = (Array.isArray(mapping[key]) ? mapping[key] : [mapping[key]]).filter(Boolean), m = ms[0], a = doc.createElement('span'), b = doc.createElement('code'), c = doc.createElement('button'), d = doc.createElement('button');
      a.textContent = label; b.textContent = ms.length ? ms.map((x) => `${x.kind} ${x.index}${x.invert ? ' flipped' : ''}`).join(' or ') : 'not assigned';
      c.textContent = assigning && assigning.key === key ? 'move it now…' : 'Assign'; c.className = assigning && assigning.key === key ? 'on' : '';
      c.addEventListener('click', () => { const p = thePad(); assigning = p ? { key, before: snapshot(p) } : null; drawMapping(); });
      if (key === 'wing' && m) { d.textContent = mapping.wingToggles ? 'each press toggles' : 'open while on'; d.addEventListener('click', () => { mapping.wingToggles = !mapping.wingToggles; saveMapping(); drawMapping(); }); }
      else { d.textContent = 'Flip'; d.disabled = !m; d.addEventListener('click', () => { if (m) { mapping[key] = { ...m, invert: !m.invert }; saveMapping(); drawMapping(); } }); }
      box.append(a, b, c, d);
    }
    const r = doc.createElement('button'); r.textContent = `Back to the TX12 defaults (${PAD_DEFAULT.name})`; r.style.gridColumn = '1 / -1'; r.style.justifySelf = 'start';
    r.addEventListener('click', () => { mapping = structuredClone(PAD_DEFAULT.mapping); saveMapping(); drawMapping(); }); box.append(r);
  }
  function pollPad() {
    const p = thePad();
    if (!p) { padRead = null; if (padShown) { padShown = false; $('padBody').hidden = true; $('padStatus').textContent = 'disconnected.'; } return; }
    if (!padShown && assist === null) { assist = false; game.assistOn = false; }      // with the lift stick in hand she is flown by hand; the radio's button turns the stabilisation on
    if (!padShown) { padShown = true; $('padBody').hidden = false; $('padStatus').textContent = `${p.id}: ${p.axes.length} axes, ${p.buttons.length} buttons. Defaults for the ${PAD_DEFAULT.name}.`; drawMapping();
      $('padAxes').replaceChildren(...p.axes.map((_, i) => { const w = doc.createElement('div'), bar = doc.createElement('div'), dot = doc.createElement('i'); w.textContent = `axis ${i}`; bar.className = 'bar'; bar.append(dot); w.append(bar); return w; })); }
    [...$('padAxes').children].forEach((w, i) => { const dot = w.querySelector('i'); if (dot) dot.style.left = `${(((p.axes[i] || 0) + 1) / 2) * 100}%`; if (w.firstChild) w.firstChild.textContent = `axis ${i}  ${(p.axes[i] || 0).toFixed(2)}`; });
    const live = p.buttons.map((b, i) => [i, b.value || (b.pressed ? 1 : 0)]).filter(([, v]) => v > 0.02);      // some browsers hand a stick over as an analog button
    $('padButtons').textContent = live.length ? 'buttons active: ' + live.map(([i, v]) => `button ${i} = ${v.toFixed(2)}`).join(', ') : 'buttons active: none';
    if (assigning) { const hit = movedControl(p, assigning.before); if (hit) { mapping[assigning.key] = { ...hit, invert: false }; assigning = null; saveMapping(); drawMapping(); } padRead = null; return; }
    padRead = readPad(p, mapping);
    if (padRead.assist && !prevPadAssist) { assist = !game.assistOn; game.assistOn = assist; }      // the radio's button for the automatic stabilisation
    prevPadAssist = padRead.assist;
  }

  function restart() {
    if (demo) lifted = demo.start === 'lifted';
    game = makeGame(data.physics, level, { gait: lifted ? 'lifted' : 'pulled' }); cmds = makeCommands({ ...level.input, balance: level.balance });
    if (assist !== null) game.assistOn = assist;
    if (lifted) cmds.state.wingOn = true; clock = makeClock(dt); cmd = cmds.update({}, dt);
    demoState = freshState(); if (!seeking) { moment = -1; paused = false; } drawMoments();
    game.world.setBus(busOn, 0);
    renderer = makeRenderer($('cv'), game.world, data.physics); renderer.snap(game);
    $('result').hidden = true; keys = {};
  }
  function readout() {
    const g = game, o = g.out, [vx, vy] = g.velocity(), head = g.head(), geo = g.world.geom(), G0 = g.P.G;
    const rows = [
      ['game speed', `${scale.toFixed(2)}× real time${cmd.slow ? `, slow motion ×${level.input.slow_motion}` : ''}  ([ ])`],
      ['state', g.mode === 'wire' ? 'on the wire' : `in the air ${g.airTime.toFixed(2)} s${g.fl.waiting ? ', hoop: waiting for the moment to open (Space calls it off)' : g.reaching ? ', reaching for the wire (Space calls it off)' : g.fl.curl > 0.5 ? ', hoop' : g.fl.curl > 0 ? ', curling' : ''}`],
      ['tip speed', g.mode === 'wire' ? `${(g.st.u * 3.6).toFixed(0)} km/h` : 'off the wire'],
      ['tip acceleration', g.mode === 'wire' ? `${(g.aP / G0).toFixed(2)} g${g.saturated ? ' (the tips slip)' : ''}` : '—'],
      ['tips', g.mode === 'wire' && o ? `coils ${o.fCoil >= 0 ? '+' : ''}${o.fCoil.toFixed(0)} N, jaws ${(-o.fJaw).toFixed(0)} N, shoe ${(-o.fShoe).toFixed(0)} N${Math.abs(o.slip) > 1 ? `, asked ${Math.abs(o.slip).toFixed(0)} N more` : ''}` : 'free'],
      ['her speed', `${(Math.hypot(vx, vy) * 3.6).toFixed(0)} km/h`],
      ['pole length', `${g.poleLength().toFixed(2)} m`],
      ['pole angle', g.mode === 'wire' ? `${deg(g.st.th).toFixed(0)}°` : `${(g.turns).toFixed(2)} turns so far`],
      ['spin', g.mode === 'wire' ? `${(g.st.om / (2 * Math.PI)).toFixed(2)} turns/s (swing)` : `${(g.F.spin(g.fl) / (2 * Math.PI)).toFixed(2)} turns/s  (↑ faster, ↓ slower)`],
      ['poles', g.mode === 'wire' && o ? (o.tension >= 0 ? `pull ${(o.tension / g.P.W).toFixed(1)} g` : `push ${(-o.tension).toFixed(0)} N`) : 'free'],
      ['body', g.arcing() ? `narrow: arc burning, ${(g.arcUntil - g.t).toFixed(1)} s` : cmd.spread ? `spread, pitch ${deg(cmd.pitch).toFixed(0)}°` : 'narrow'],
      ['balance assist', !g.assistOn ? 'off (T, or the radio\'s button)' : !g.balance ? 'on, waiting: wing on and 35° ahead of her tips' : g.balance.ok ? `holding ${deg(g.balance.lead).toFixed(0)}° lead, pitch ${deg(g.balance.pitch).toFixed(1)}°` : `too slow to fly at ${deg(g.balance.lead).toFixed(0)}° lead`],
      ['lift', g.mode === 'wire' && o ? `${((100 * o.lift) / g.P.W).toFixed(0)} % of her weight` : '—'],
      ['above the wires', `${head[1].toFixed(1)} m`],
      ['to the bus', !g.world.bus.on ? 'no trolleybus (B)' : head[0] < geo.shoes ? `${(geo.shoes - g.tips()[0]).toFixed(0)} m to its shoes` : head[0] < geo.front ? 'over it' : `${(head[0] - geo.front).toFixed(0)} m past it`],
    ];
    $('readout').replaceChildren(...rows.map(([a, b]) => { const d = doc.createElement('div'), x = doc.createElement('span'), y = doc.createElement('span'); x.textContent = a; y.textContent = b; d.append(x, y); return d; }));
  }
  function frame(now) {
    pollPad();
    const elapsed = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now;      // never negative: frame times and performance.now can disagree at start
    if (!paused && !game.over) clock.advance(elapsed * scale * (cmd.slow ? level.input.slow_motion : 1), () => {
      if (paused) return;
      cmd = cmds.update(demo ? demo.plan(game, demo.params, demoState) : watch ? autopilots.brakePullHoop(game) : keys, dt, watch || demo ? null : padRead); game.step(cmd, dt); if (game.events.includes('arc')) cmds.cancelSpread();
      if (demo) { if (game.won && game.over) { game.over = null; game.passedAt = Infinity; }              // a demo runs on past the win
        const next = moments.findIndex((k) => k.t > game.t - dt - 1e-9 && k.t <= game.t + 1e-9); if (next >= 0) { moment = next; if (stopAtMoments) paused = true; drawMoments(); } }
    });
    renderer.draw(game, game.shown || cmd, level.tuning, demo ? marks() : []); readout();
    if (sound) { if (paused || game.over) sound.mute(); else sound.update(game);
      const st = sound.status, bs = sound.busStatus; $('soundStatus').textContent = `${st.playing}: her tips hum ${st.hz.toFixed(0)} Hz at ${(20 * Math.log10(Math.max(1e-4, st.gain))).toFixed(0)} dB; the trolleybus ${bs.playing === 'silent' ? 'off' : `hums ${bs.hz.toFixed(0)} Hz`}`; }
    if (game.over && $('result').hidden) {
      $('result').hidden = false; $('resultTitle').textContent = game.won ? 'Past the bus' : 'Run over';
      $('resultText').textContent = `${game.over} ${game.won ? `Speed kept: ${((100 * game.st.u) / game.startSpeed).toFixed(0)} %. Apex ${game.apex.toFixed(1)} m above the wires, ${Math.abs(game.turns).toFixed(1)} turns.` : ''} Press R to go again.`;
    }
    requestAnimationFrame(frame);
  }
  doc.addEventListener('keydown', (e) => {
    if (e.key === 'r' || e.key === 'R') { restart(); return; }
    if (e.key === 'p' || e.key === 'P') { paused = !paused; drawMoments(); return; }
    if (demo && (e.key === ',' || e.key === '.')) { seek(Math.min(Math.max(moment + (e.key === '.' ? 1 : -1), 0), moments.length - 1)); return; }
    if (e.key === 'a' || e.key === 'A') { watch = !watch; restart(); return; }
    if (e.key === '[' || e.key === ']') { const S = level.input.time_scales || [0.25, 0.5, 1], i = S.reduce((b, v, j) => (Math.abs(v - scale) < Math.abs(S[b] - scale) ? j : b), 0); scale = S[Math.min(Math.max(i + (e.key === ']' ? 1 : -1), 0), S.length - 1)]; return; }
    if (e.key === 't' || e.key === 'T') { assist = !game.assistOn; game.assistOn = assist; return; }
    if (e.key === 'l' || e.key === 'L') { lifted = !lifted; restart(); return; }
    if (e.key === 'b' || e.key === 'B') { busOn = !busOn; game.world.setBus(busOn, game.tips()[0]); game.passedAt = null; return; }   // free practice: no trolleybus; back on, it appears ahead of her
    const k = KEYMAP[e.key]; if (k) { keys[k] = true; e.preventDefault(); }
  });
  doc.addEventListener('keyup', (e) => { const k = KEYMAP[e.key]; if (k) { keys[k] = false; e.preventDefault(); } });
  window.addEventListener('blur', () => { keys = {}; });
  $('cv').addEventListener('pointerdown', () => $('cv').focus());
  new ResizeObserver(() => renderer.resize()).observe($('cv'));
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => renderer.readTokens());
  if (demo) { $('title').textContent = `Demo: ${demo.title}`; $('lede').textContent = `${demo.kind === 'line' ? 'A line' : 'A candidate badge'}: ${demo.what}. ${demo.closes ? 'It closes' : 'It does not close'}${Object.keys(demo.numbers).length ? ' (' + Object.entries(demo.numbers).map(([k, v]) => `${k} ${v}`).join(', ') + ')' : ''}. ${demo.note} Playback stops at each numbered moment; P plays on, , and . step between moments, R restarts.`;
    $('demoBox').hidden = false; $('stopAt').addEventListener('change', (e) => { stopAtMoments = e.target.checked; }); }
  // the sound controls live on every page, demo or not
  { const sel = $('soundVariant');
    const lazOpt = sel.querySelector && sel.querySelector('option[value=laz]'); if (!data.sounds && lazOpt) lazOpt.disabled = true;
    // the default: the hash, else what this browser last chose, else the recordings when the build has them (the local build), else off
    let saved = null; try { saved = JSON.parse(localStorage.getItem('roping-sound') || 'null'); } catch (e) { /* storage blocked */ }
    const variant0 = soundWant || (saved && saved.variant) || (data.sounds ? 'laz' : 'off');
    sel.value = variant0 === 'laz' && !data.sounds ? 'synth' : variant0;
    const apply = () => { setSound(sel.value); try { localStorage.setItem('roping-sound', JSON.stringify({ variant: sel.value })); } catch (e) { /* session only */ } };
    sel.addEventListener('change', apply);
    if (sel.value !== 'off') doc.addEventListener('pointerdown', apply, { once: true }); }
  if (data.demos && Object.keys(data.demos).length) { $('demoList').hidden = false;
    $('demoLinks').replaceChildren(...Object.entries(data.demos).map(([id, d]) => { const a = doc.createElement('a'); a.href = `#demo=${id}`; a.textContent = `${d.title}`; a.title = d.what; a.className = d.closes ? 'closes' : 'open'; return a; }));
    window.addEventListener('hashchange', () => location.reload()); }                     // a demo link changes the hash; the page is rebuilt from it
  restart();
  const at = /[#&]t=([\d.]+)/.exec(location.hash);          // #watch&t=3.3 : the autopilot's run, held at that moment (a still mode)
  if (at) { for (let i = 0; i < +at[1] / dt && !game.over; i++) { cmd = cmds.update(autopilots.brakePullHoop(game), dt); game.step(cmd, dt); } if (/[#&]arc/.test(location.hash)) game.arcUntil = game.t + 2.5;
    if (/[#&]hoop/.test(location.hash) && game.fl) { game.fl.l = 1.0; game.fl.curl = 1; }   // a still of the hoop   // a still of the arc, for checking the drawing
    paused = true; renderer.snap(game); for (let i = 0; i < 60; i++) renderer.draw(game, game.shown || cmd, level.tuning); }
  requestAnimationFrame(frame);
  return { game: () => game, paused: () => paused, scale: () => scale };           // for the page smoke test
}
