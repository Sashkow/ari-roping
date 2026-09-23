// SPDX-License-Identifier: GPL-3.0-or-later
// The sound of her tips (2026-09-24). Two variants of the same pair of sounds a ZiU/Ganz trolleybus makes:
// a traction-motor hum whose pitch follows speed, and a chopper that sings one fixed note (900 Hz on the
// Ganz-GVM) whatever the speed. Each variant has two stages: `bus`, the trolleybus as it is, and `ari`,
// her tips: the hum two octaves up (her coils' pole pitch is centimetres, the bus reaches its speed
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

export const CHOPPER_HZ = 900;
export const RECORDED_WHINE_HZ = 485;     // the reducer recording's pitch, taken as the bus at cruise (22 m/s)

export function makeSound(ctx, opts = {}) {
  const stage = { name: opts.stage || 'ari', variant: opts.variant || 'synth' };
  const master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
  const coilRating = opts.coilRating || 40;
  // ---- synth: hum = fundamental + 3 harmonics through a low-pass; chopper = square with a 50 Hz wobble
  const hum = ctx.createGain(), humLp = ctx.createBiquadFilter(); humLp.type = 'lowpass'; humLp.frequency.value = 2500; hum.connect(humLp); humLp.connect(master);
  const harmonics = [1, 2, 3, 4].map((n, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = i === 0 ? 'triangle' : 'sine'; g.gain.value = [0.6, 0.25, 0.12, 0.06][i]; o.connect(g); g.connect(hum); o.start(); return { o, n }; });
  // chopper: a square wave through two gains in series: `chop` is the level (0 when silent), `wob` multiplies it by a slow 1 +/- 0.15 wobble.
  // (An earlier version added the wobble to the level itself, so the chopper leaked at a fixed volume whenever the level was 0: in the air, and in the recordings variant.)
  const chop = ctx.createGain(), wob = ctx.createGain(), chopOsc = ctx.createOscillator(), wobble = ctx.createOscillator(), wobbleGain = ctx.createGain();
  chopOsc.type = 'square'; chopOsc.frequency.value = CHOPPER_HZ; chopOsc.connect(chop); chop.connect(wob); wob.connect(master); chopOsc.start();
  wob.gain.value = 1; wobble.frequency.value = 50; wobbleGain.gain.value = 0.15; wobble.connect(wobbleGain); wobbleGain.connect(wob.gain); wobble.start();
  chop.gain.value = 0;
  // ---- laz: looped recordings, if given
  let motorSrc = null, chopSrc = null; const motorGain = ctx.createGain(), chopGain2 = ctx.createGain(), lazHp = ctx.createBiquadFilter();
  lazHp.type = 'highpass'; lazHp.frequency.value = 80; motorGain.connect(lazHp); lazHp.connect(master); chopGain2.connect(master); motorGain.gain.value = 0; chopGain2.gain.value = 0;
  const looped = (buf, start, end, fade) => {
    const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
    const cut = seamlessLoop(chans, buf.sampleRate, start, Math.min(end, buf.duration), fade);
    const b = ctx.createBuffer(cut.channels.length, cut.length, buf.sampleRate);
    cut.channels.forEach((ch, c) => b.copyToChannel(ch, c));
    const src = ctx.createBufferSource(); src.buffer = b; src.loop = true; return src;
  };
  if (opts.buffers && opts.buffers.motor && opts.buffers.chopper) {
    // the reducer clip: its steady middle, a 0.15 s crossfade; the chopper: after its spin-up (first 1.2 s), a 0.3 s crossfade
    motorSrc = looped(opts.buffers.motor, 0.1, opts.buffers.motor.duration - 0.05, 0.15); motorSrc.connect(motorGain); motorSrc.start();
    chopSrc = looped(opts.buffers.chopper, 1.2, opts.buffers.chopper.duration - 0.05, 0.3); chopSrc.connect(chopGain2); chopSrc.start();
  }
  const hasLaz = !!motorSrc;
  // ---- the jaws: a short click when they close
  let jawWas = 0, jawArmed = true, lastClick = -1;   // a click only when the jaws go from nearly nothing to a firm hold, and not more than a few times a second
  function click() {
    const n = ctx.sampleRate * 0.03, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
    const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = b; g.gain.value = stage.name === 'ari' ? 0.05 : 0.3; s.connect(g); g.connect(master); s.start();
  }
  const ramp = (p, v, t = 0.03) => { p.cancelScheduledValues(ctx.currentTime); p.setTargetAtTime(v, ctx.currentTime, t); };

  const status = { playing: 'none', hz: 0, gain: 0, chopper: 0 };
  // the forces flicker frame to frame (the throttle trims through zero many times a second); the ear gets a 0.3 s average
  let coilAvg = 0, jawAvg = 0, lastT = ctx.currentTime;
  const CHOP_LEVEL = { bus: 0.05, ari: 0.004 };   // the chopper well under the hum
  return {
    stage, hasLaz, status,
    set(name, variant) { if (name) stage.name = name; if (variant) stage.variant = variant; },
    /** Called once per frame with the game. */
    update(g) {
      const on = g.mode === 'wire' && g.out, u = on ? g.st.u : 0, fCoilNow = on ? Math.abs(g.out.fCoil || 0) : 0, fJawNow = on ? Math.abs(g.out.fJaw || 0) : 0;
      const now = ctx.currentTime, k = 1 - Math.exp(-(now - lastT) / 0.3); lastT = now;
      coilAvg += (fCoilNow - coilAvg) * k; jawAvg += (fJawNow - jawAvg) * k;
      const fCoil = on ? coilAvg : 0, fJaw = on ? jawAvg : 0;
      const f = humHz(u, stage.name), gain = on ? humGain(fCoil, fJaw, coilRating, stage.name) : 0;
      const chopper = on ? (0.3 + 0.7 * Math.min(1, fCoil / coilRating)) * CHOP_LEVEL[stage.name] : 0;
      const synth = stage.variant === 'synth' || !hasLaz;
      for (const { o, n } of harmonics) ramp(o.frequency, Math.min(8000, f * n), 0.02);
      ramp(hum.gain, synth ? gain : 0, 0.1); ramp(chop.gain, synth ? chopper : 0, 0.1);
      status.playing = !on ? 'silent (in the air)' : synth ? (stage.variant === 'laz' ? 'synth (the recordings did not load)' : 'synth') : 'recordings';
      status.hz = f; status.gain = gain; status.chopper = chopper;
      if (hasLaz) {
        // the recording is the bus at cruise as recorded; Ari's stage is her pitch law over the recording's, 733 / 485 at cruise
        const rate = stage.name === 'ari' ? f / RECORDED_WHINE_HZ : Math.abs(u) / 22;
        ramp(motorSrc.playbackRate, Math.max(0.05, rate), 0.02);
        ramp(motorGain.gain, synth ? 0 : gain * 2.0, 0.1); ramp(chopGain2.gain, synth ? 0 : chopper * 1.5, 0.1);
      }
      const j = fJawNow;
      if (j < 15) jawArmed = true;
      if (jawArmed && j > 60 && ctx.currentTime - lastClick > 0.4) { click(); jawArmed = false; lastClick = ctx.currentTime; }
      jawWas = j;
      ramp(master.gain, 0.8, 0.05);
    },
    mute() { ramp(master.gain, 0, 0.05); },
  };
}
