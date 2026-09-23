// SPDX-License-Identifier: GPL-3.0-or-later
// The sound of her tips and of the trolleybus (2026-09-24). Two variants of the same pair of sounds a ZiU/Ganz trolleybus makes:
// a traction-motor hum whose pitch follows speed, and a chopper that sings one fixed note (900 Hz on the
// Ganz-GVM) whatever the speed. Two voices: the trolleybus in the game at the `bus` stage, as it is, at its own
// speed, panned to where it is; and her tips at the `ari` stage: the hum two octaves up (her coils' pole pitch is centimetres, the bus reaches its speed
// through a wheel and a gearbox), the whole thing far quieter (40 N of force, not kilonewtons), the
// chopper note kept, since a switching frequency is a design choice, not a size.
//   synth   Web Audio oscillators: the hum from a few harmonics, the chopper from a square wave with a
//           slow amplitude wobble.
//   laz     two recordings of the real thing (the Rába axle-reducer whine of the bus, 485 Hz as recorded,
//           and the GVM chopper), looped, the whine resampled to follow speed. The recordings are not in the repository (unknown authors); the
//           local build embeds them from local/sounds/ when present.
// Driven from the frame loop: update(game) reads tip speed and the coil and jaw forces of the last step.
// Pure functions first, so node can test the mapping without an AudioContext.

/** Hum frequency in hertz for a tip speed u (m/s). bus: the DK-213 recording's ~190 Hz at 22 m/s; ari: u / pole pitch (3 cm). */
export function humHz(u, stage) {
  return stage === 'ari' ? Math.abs(u) / 0.03 : Math.abs(u) * (190 / 22);
}

/** Loudness 0..1 of the hum from the coil force (N) and the coil rating; the jaws add a little grind. */
export function humGain(fCoil, fJaw, coilRating, stage) {
  const drive = Math.min(1, Math.abs(fCoil) / coilRating), jaw = Math.min(0.5, Math.abs(fJaw) / 450);
  return (0.15 + 0.85 * drive + 0.5 * jaw) * (stage === 'ari' ? 0.06 : 1);       // ari: about -25 dB
}

/**
 * Cut [start, end] seconds out of a recording and make it loop without a seam: the last `fade` seconds are
 * crossfaded (equal power) into the first, and the loop ends before the faded tail. Pure on sample arrays.
 */
export function seamlessLoop(channels, sampleRate, start, end, fade) {
  const s0 = Math.floor(start * sampleRate), s1 = Math.min(channels[0].length, Math.floor(end * sampleRate)), n = s1 - s0, nf = Math.min(Math.floor(fade * sampleRate), Math.floor(n / 2));
  const out = channels.map((ch) => {
    const o = new Float32Array(n - nf);
    for (let i = 0; i < n - nf; i++) o[i] = ch[s0 + i];
    for (let i = 0; i < nf; i++) { const w = 0.5 * (1 - Math.cos((Math.PI * i) / nf)); o[i] = ch[s0 + i] * Math.sqrt(w) + ch[s0 + n - nf + i] * Math.sqrt(1 - w); }
    return o;
  });
  return { channels: out, length: n - nf };
}

/**
 * Doppler factor heard by a listener on the wire. dx: source position minus listener's (m, along the wire);
 * vListener, vSource: their velocities along the wire (m/s). c = 343 m/s. Ahead and being caught: above 1.
 */
export function doppler(dx, vListener, vSource, c = 343) {
  const n = dx >= 0 ? 1 : -1;                                   // from the listener toward the source
  return (c + n * vListener) / (c + n * vSource);
}

export const CHOPPER_HZ = 900;
export const RECORDED_WHINE_HZ = 485;     // the reducer recording's pitch, taken as the bus at cruise (22 m/s)

/** One sounding thing (her tips, or the trolleybus): a hum that follows its speed and a chopper on one note, in one stage, synth or recordings. */
function makeVoice(ctx, out, stageName, coilRating, buffers) {
  const master = ctx.createGain(); master.gain.value = 0; master.connect(out);
  // synth: hum = fundamental + 3 harmonics through a low-pass; chopper = square through two gains in series (level, then a 1 +/- 0.15 wobble)
  const hum = ctx.createGain(), humLp = ctx.createBiquadFilter(); humLp.type = 'lowpass'; humLp.frequency.value = 2500; hum.connect(humLp); humLp.connect(master);
  const harmonics = [1, 2, 3, 4].map((n, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = i === 0 ? 'triangle' : 'sine'; g.gain.value = [0.6, 0.25, 0.12, 0.06][i]; o.connect(g); g.connect(hum); o.start(); return { o, n }; });
  const chop = ctx.createGain(), wob = ctx.createGain(), chopOsc = ctx.createOscillator(), wobble = ctx.createOscillator(), wobbleGain = ctx.createGain();
  chopOsc.type = 'square'; chopOsc.frequency.value = CHOPPER_HZ; chopOsc.connect(chop); chop.connect(wob); wob.connect(master); chopOsc.start();
  wob.gain.value = 1; wobble.frequency.value = 50; wobbleGain.gain.value = 0.15; wobble.connect(wobbleGain); wobbleGain.connect(wob.gain); wobble.start();
  chop.gain.value = 0;
  // recordings, looped over their steady middle
  let motorSrc = null, chopSrc = null; const motorGain = ctx.createGain(), chopGain2 = ctx.createGain(), lazHp = ctx.createBiquadFilter();
  lazHp.type = 'highpass'; lazHp.frequency.value = 80; motorGain.connect(lazHp); lazHp.connect(master); chopGain2.connect(master); motorGain.gain.value = 0; chopGain2.gain.value = 0;
  const looped = (buf, start, end, fade) => {
    const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
    const cut = seamlessLoop(chans, buf.sampleRate, start, Math.min(end, buf.duration), fade);
    const b = ctx.createBuffer(cut.channels.length, cut.length, buf.sampleRate);
    cut.channels.forEach((ch, c) => b.copyToChannel(ch, c));
    const src = ctx.createBufferSource(); src.buffer = b; src.loop = true; return src;
  };
  if (buffers && buffers.motor && buffers.chopper) {
    motorSrc = looped(buffers.motor, 0.1, buffers.motor.duration - 0.05, 0.15); motorSrc.connect(motorGain); motorSrc.start();
    chopSrc = looped(buffers.chopper, 1.2, buffers.chopper.duration - 0.05, 0.3); chopSrc.connect(chopGain2); chopSrc.start();
  }
  const hasLaz = !!motorSrc;
  const CHOP_LEVEL = { bus: 0.05, ari: 0.004 };
  let coilAvg = 0, jawAvg = 0, lastT = ctx.currentTime, jawArmed = true, lastClick = -1;
  const ramp = (p, v, t = 0.03) => { p.cancelScheduledValues(ctx.currentTime); p.setTargetAtTime(v, ctx.currentTime, t); };
  function click() {
    const n = ctx.sampleRate * 0.03, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
    const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = b; g.gain.value = stageName === 'ari' ? 0.05 : 0.3; s.connect(g); g.connect(master); s.start();
  }
  const status = { playing: 'none', hz: 0, gain: 0 };
  return {
    status, hasLaz,
    /** on: sounding at all; u: speed along the wire; fCoil, fJaw: forces (N) this frame; variant: 'synth' | 'laz'; level: 0..1 overall (distance) */
    update(on, u, fCoilNow, fJawNow, variant, level = 1, dop = 1) {
      const now = ctx.currentTime, k = 1 - Math.exp(-(now - lastT) / 0.3); lastT = now;          // the forces flicker; the ear gets a 0.3 s average
      coilAvg += (Math.abs(fCoilNow) - coilAvg) * k; jawAvg += (Math.abs(fJawNow) - jawAvg) * k;
      const f = humHz(u, stageName), gain = on ? humGain(coilAvg, jawAvg, coilRating, stageName) : 0;
      const chopper = on ? (0.3 + 0.7 * Math.min(1, coilAvg / coilRating)) * CHOP_LEVEL[stageName] : 0;
      const synth = variant === 'synth' || !hasLaz;
      for (const { o, n } of harmonics) ramp(o.frequency, Math.min(8000, f * n * dop), 0.02);
      ramp(chopOsc.frequency, CHOPPER_HZ * dop, 0.02);
      ramp(hum.gain, synth ? gain : 0, 0.1); ramp(chop.gain, synth ? chopper : 0, 0.1);
      if (hasLaz) {
        const rate = stageName === 'ari' ? f / RECORDED_WHINE_HZ : Math.abs(u) / 22;               // the recording is the bus at cruise as recorded
        ramp(motorSrc.playbackRate, Math.max(0.05, rate) * dop, 0.02); ramp(chopSrc.playbackRate, dop, 0.02);
        ramp(motorGain.gain, synth ? 0 : gain * 2.0, 0.1); ramp(chopGain2.gain, synth ? 0 : chopper * 1.5, 0.1);
      }
      const j = Math.abs(fJawNow);
      if (j < 15) jawArmed = true;
      if (on && jawArmed && j > 60 && now - lastClick > 0.4) { click(); jawArmed = false; lastClick = now; }
      ramp(master.gain, 0.8 * level, 0.05);
      status.playing = !on ? 'silent' : synth ? (variant === 'laz' ? 'synth (the recordings did not load)' : 'synth') : 'recordings';
      status.hz = f * dop; status.gain = gain;
    },
    mute() { ramp(master.gain, 0, 0.05); },
  };
}

/** Her tips and the trolleybus, each with its own voice: hers at the `ari` stage, the bus's at the `bus` stage, panned to where it is and fading with distance. */
export function makeSound(ctx, opts = {}) {
  const variant = { name: opts.variant || 'synth' }, coilRating = opts.coilRating || 40;
  const ariOut = ctx.createGain(); ariOut.connect(ctx.destination);
  const busPan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain(); busPan.connect(ctx.destination);
  const ari = makeVoice(ctx, ariOut, 'ari', coilRating, opts.buffers), bus = makeVoice(ctx, busPan, 'bus', coilRating, opts.buffers);
  const BUS_DRIVE = 0.4;                        // the trolleybus rolls at a steady few m/s: a modest, constant drive
  return {
    variant, hasLaz: ari.hasLaz, status: ari.status, busStatus: bus.status,
    set(v) { if (v) variant.name = v; },
    update(g) {
      const on = g.mode === 'wire' && g.out;
      ari.update(on, on ? g.st.u : 0, on ? g.out.fCoil || 0 : 0, on ? g.out.fJaw || 0 : 0, variant.name, 1);
      const b = g.world.bus, geo = g.world.geom(), hx = g.head()[0];
      const dx = b.on ? (geo.rear + geo.front) / 2 - hx : 0, dist = Math.abs(dx), vx = g.velocity()[0];
      const dop = b.on ? doppler(dx, vx, b.v) : 1;                              // she is the listener: a semitone up closing at 79 km/h, a drop as she passes
      const level = b.on ? 1 / (1 + (dist / 25) ** 2) : 0;                      // half at 25 m, a tenth at 75
      if (busPan.pan) busPan.pan.setTargetAtTime(Math.max(-1, Math.min(1, dx / 30)), ctx.currentTime, 0.1);
      bus.update(b.on, b.v, BUS_DRIVE * coilRating, 0, variant.name, level, dop);
    },
    mute() { ari.mute(); bus.mute(); },
  };
}
