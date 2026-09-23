// SPDX-License-Identifier: GPL-3.0-or-later
// Side view, to scale, on a canvas. Drawing code descends from the Roping Ari animation pages
// (radio_ocean/notes/scenes/ari-roping): dusk sky, far skyline, road, supports, the two wires, the
// trolleybus with its poles on them, and Ari with her poles, body form, flare streaks.
import { clamp } from './util.js';

export function makeRenderer(canvas, world, physics) {
  const ctx = canvas.getContext('2d');
  const WIRE_H = world.WIRE_H, LB = physics.body.length, B = physics.bus;
  let W = 0, H = 0, S = 1, camX = 0, viewH = 11.6, C = {};
  const tokens = ['ground', 'panel', 'ink', 'muted', 'violet', 'rust', 'copper', 'cream', 'amber', 'sky1', 'sky2', 'city', 'road', 'bus', 'glass', 'pole'];
  function readTokens() { const cs = getComputedStyle(document.documentElement); for (const k of tokens) C[k] = cs.getPropertyValue('--' + k).trim(); }
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2), r = canvas.getBoundingClientRect();
    W = r.width; H = r.height; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const X = (x) => (x - camX) * S + W * 0.38, Y = (y) => H - (WIRE_H + y + 0.9) * S;
  const line = (x1, y1, x2, y2, col, w, dash) => { ctx.beginPath(); ctx.setLineDash(dash || []); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); ctx.setLineDash([]); };

  function drawWorld() {
    const grad = ctx.createLinearGradient(0, 0, 0, Y(-WIRE_H)); grad.addColorStop(0, C.sky1); grad.addColorStop(1, C.sky2);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = C.city;
    const par = 0.25, k0 = Math.floor((camX * par - W / S) / 7) - 1;
    for (let k = k0; k < k0 + (W / S / 7) * 1.2 + 8; k++) {
      const h = 2.2 + 3.4 * Math.abs((Math.sin(k * 12.9898) * 43758.5453) % 1), w = 4.5 + 2 * Math.abs(Math.sin(k * 7.13) % 1);
      ctx.fillRect((k * 7 - camX * par) * S + W * 0.38, Y(-WIRE_H) - h * S, w * S, h * S + 1);
    }
    ctx.fillStyle = C.road; ctx.fillRect(0, Y(-WIRE_H), W, H - Y(-WIRE_H));
    line(0, Y(-WIRE_H), W, Y(-WIRE_H), C.muted, 1);
    const n0 = Math.floor((camX - W / S) / world.SPAN);
    for (let k = n0; k <= n0 + Math.ceil((2 * W) / S / world.SPAN) + 1; k++) {
      const sx = X(k * world.SPAN + 10);
      line(sx, Y(-WIRE_H), sx, Y(1.1), C.muted, Math.max(2, 0.14 * S)); line(sx - 0.5 * S, Y(0.55), sx + 0.5 * S, Y(0.55), C.muted, 1.5);
    }
    line(0, Y(0.12), W, Y(0.12), C.muted, 1); line(0, Y(0), W, Y(0), C.ink, 1.6);
    const g = world.geom();
    if (world.bus.on && X(g.front) > -50 && X(g.shoes) < W + 50) {
      const yb = Y(g.floorY), yr = Y(g.roofY), bh = yb - yr;
      ctx.fillStyle = C.bus; ctx.beginPath(); ctx.roundRect(X(g.rear), yr, B.length * S, bh, [0.25 * S, 0.7 * S, 0.1 * S, 0.1 * S]); ctx.fill();
      ctx.fillStyle = C.glass; ctx.fillRect(X(g.rear + 0.5), yr + bh * 0.2, (B.length - 1.3) * S, bh * 0.34);
      ctx.fillStyle = C.bus; for (let q = 1; q < 6; q++) ctx.fillRect(X(g.rear + 0.5 + (q * (B.length - 1.3)) / 6), yr + bh * 0.2, Math.max(1, 0.08 * S), bh * 0.34);
      ctx.fillStyle = C.pole; for (const wx of [g.rear + 2.6, g.front - 2.4]) { ctx.beginPath(); ctx.arc(X(wx), Y(-WIRE_H + 0.5), 0.5 * S, 0, 7); ctx.fill(); }
      ctx.fillStyle = C.rust; ctx.fillRect(X(g.rear) - 1, yr + bh * 0.66, Math.max(2, 0.1 * S), bh * 0.12);
      ctx.fillStyle = C.pole; ctx.fillRect(X(g.rear + 3.6), yr - 0.22 * S, 2.2 * S, 0.22 * S);
      line(X(g.poleBase), yr - 0.2 * S, X(g.shoes), Y(0.02), C.ink, 2); line(X(g.poleBase + 0.1), yr - 0.2 * S, X(g.shoes + 0.1), Y(0.13), C.muted, 1.4);
      ctx.fillStyle = C.ink; ctx.fillRect(X(g.shoes) - 3, Y(0) - 1, 7, 4);
    }
  }

  function drawAri(game, cmd, ghost) {
    const [hx, hy] = game.head(), [tx, ty] = game.tips(), tail = game.tailAngle(cmd);
    const spread = cmd && cmd.spread, flare = spread ? clamp((cmd.pitch - 0.6) / 0.6, 0, 1) : 0;
    ctx.globalAlpha = ghost ? 0.35 : 1;
    // poles: dark with rust bands, bowed when they push; curled, poles and body bend into one closed ring
    const push = game.mode === 'wire' && game.out ? clamp(-game.out.tension / 60, 0, 1) : 0;
    const l = game.poleLength(), curl = game.mode === 'air' && game.fl ? game.fl.curl || 0 : 0, cs = curl * curl * (3 - 2 * curl);
    const chain = (x, y, dir, len, kappa, n) => { const pts = [[x, y]], du = len / n; for (let j = 0; j < n; j++) { const a = dir + kappa * (j + 0.5) * du; x += Math.cos(a) * du; y += Math.sin(a) * du; pts.push([x, y]); } return pts; };
    let polePts, bodyPts = null, ox = 0, oy = 0;
    if (cs > 0.001) {
      const kappa = (cs * 2 * Math.PI) / (l + LB), phi = game.fl.phi;
      polePts = chain(hx, hy, phi, l, kappa, 18); bodyPts = chain(hx, hy, phi + Math.PI, LB, -kappa, 12);
      const all = polePts.concat(bodyPts); ox = cs * (all.reduce((a, p) => a + p[0], 0) / all.length - hx); oy = cs * (all.reduce((a, p) => a + p[1], 0) / all.length - hy);
      for (const p of all) { p[0] -= ox; p[1] -= oy; }                       // her centre, not her head, follows the flight path
    } else {
      const nx = -(ty - hy) / l, ny = (tx - hx) / l, sag = 0.3 * l * push * (ny > 0 ? 1 : -1), cx = (hx + tx) / 2 + nx * sag * 2, cy = (hy + ty) / 2 + ny * sag * 2;
      polePts = []; for (let j = 0; j <= 18; j++) { const q = j / 18; polePts.push([(1 - q) * (1 - q) * hx + 2 * q * (1 - q) * cx + q * q * tx, (1 - q) * (1 - q) * hy + 2 * q * (1 - q) * cy + q * q * ty]); }
    }
    const pole = (col, dash) => { ctx.beginPath(); ctx.setLineDash(dash || []); polePts.forEach((p, j) => (j ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1])))); ctx.strokeStyle = col; ctx.lineWidth = Math.max(2.4, 0.075 * S); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); ctx.setLineDash([]); ctx.lineCap = 'butt'; };
    pole(C.pole); pole(C.rust, [0.05 * S, 0.3 * S]);
    const [tipX, tipY] = polePts[polePts.length - 1], hX = hx - ox, hY = hy - oy;
    ctx.fillStyle = C.copper; ctx.beginPath(); ctx.arc(X(tipX), Y(tipY), Math.max(3, 0.1 * S), 0, 7); ctx.fill();
    if (game.mode === 'wire') { ctx.strokeStyle = C.amber; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(X(tipX), Y(tipY), Math.max(5, 0.17 * S), 0, 7); ctx.stroke(); }
    // air piling up against her while she flares
    const [vx, vy] = game.velocity(), sp = Math.hypot(vx, vy) || 1, ux = vx / sp, uy = vy / sp;
    if (flare > 0.05) {
      ctx.strokeStyle = C.cream; ctx.lineWidth = 1.2; ctx.globalAlpha *= 0.55 * flare;
      for (let k = -2; k <= 2; k++) { const bx = hx + Math.cos(tail) * (0.4 + 0.12 * k) - uy * 0.13 * k, by = hy + Math.sin(tail) * (0.4 + 0.12 * k) + ux * 0.13 * k; ctx.beginPath(); ctx.moveTo(X(bx + ux * 0.25), Y(by + uy * 0.25)); ctx.lineTo(X(bx + ux * 0.95), Y(by + uy * 0.95)); ctx.stroke(); }
      ctx.globalAlpha = ghost ? 0.35 : 1;
    }
    // body: narrow is deep (thick in side view), spread is a thin wing, broad when flared
    const wB = Math.max(5, S * (spread ? 0.17 : 0.27)) * (1 + 0.45 * flare), n = 12, pts = [];
    if (bodyPts) pts.push(...bodyPts); else for (let j = 0; j <= n; j++) pts.push([hx + (Math.cos(tail) * LB * j) / n, hy + (Math.sin(tail) * LB * j) / n]);
    for (let j = 0; j < n; j++) { ctx.beginPath(); ctx.moveTo(X(pts[j][0]), Y(pts[j][1])); ctx.lineTo(X(pts[j + 1][0]), Y(pts[j + 1][1])); ctx.strokeStyle = C.violet; ctx.lineWidth = j < 7 ? wB : wB * (1 - (0.72 * (j - 6)) / 6); ctx.lineCap = 'round'; ctx.stroke(); }
    ctx.lineCap = 'butt';
    const [ex, ey] = pts[n], end = Math.atan2(ey - pts[n - 1][1], ex - pts[n - 1][0]), f = 0.2; ctx.fillStyle = C.violet; ctx.beginPath(); ctx.moveTo(X(ex), Y(ey));
    ctx.lineTo(X(ex + Math.cos(end + 0.75) * f), Y(ey + Math.sin(end + 0.75) * f)); ctx.lineTo(X(ex + Math.cos(end - 0.75) * f), Y(ey + Math.sin(end - 0.75) * f)); ctx.fill();
    // scarf, head, the one eye
    const n1 = pts[1]; ctx.beginPath(); ctx.moveTo(X(n1[0]), Y(n1[1])); ctx.lineTo(X(n1[0] - ux * 0.5), Y(n1[1] - uy * 0.5)); ctx.strokeStyle = C.rust; ctx.lineWidth = Math.max(2, 0.07 * S); ctx.lineCap = 'round'; ctx.stroke(); ctx.lineCap = 'butt';
    ctx.fillStyle = C.rust; ctx.beginPath(); ctx.arc(X(n1[0]), Y(n1[1]), wB * 0.55, 0, 7); ctx.fill();
    const hr = Math.max(4.5, 0.15 * S), fx = -Math.cos(tail), fy = -Math.sin(tail);
    ctx.fillStyle = C.cream; ctx.strokeStyle = C.violet; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(X(hX), Y(hY), hr, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.amber; ctx.beginPath(); ctx.arc(X(hX) + fx * hr * 0.3, Y(hY) - fy * hr * 0.3, hr * 0.5, 0, 7); ctx.fill();
    ctx.fillStyle = C.pole; ctx.beginPath(); ctx.arc(X(hX) + fx * hr * 0.42, Y(hY) - fy * hr * 0.42, hr * 0.22, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // The arc between her and the wire: a copper arc burns white at the core with a green-blue fringe, and drops orange sparks.
  function drawArc(game) {
    const [hx, hy] = game.head(), left = game.arcUntil - game.t, life = clamp(left / 0.4, 0, 1);
    const wx = hx - clamp(hy, -1, 1) * 0.3, n = 9, seed = Math.floor(game.t * 40);
    const jag = (k, s) => Math.sin(seed * 12.9898 + k * 78.233 + s * 37.7) * 43758.5453 % 1;
    const path = (s, amp) => { ctx.beginPath(); ctx.moveTo(X(hx), Y(hy)); for (let k = 1; k < n; k++) { const q = k / n; ctx.lineTo(X(hx + (wx - hx) * q) + jag(k, s) * amp, Y(hy * (1 - q)) + jag(k + 50, s) * amp * 0.6); } ctx.lineTo(X(wx), Y(0)); };
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.globalAlpha = 0.35 + 0.65 * life;
    path(1, 0.22 * S); ctx.strokeStyle = '#5FE3C0'; ctx.lineWidth = Math.max(4, 0.12 * S); ctx.shadowColor = '#5FE3C0'; ctx.shadowBlur = 18; ctx.stroke();
    path(2, 0.12 * S); ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = Math.max(1.6, 0.04 * S); ctx.shadowBlur = 6; ctx.stroke();
    ctx.shadowBlur = 0; ctx.fillStyle = '#FFB066';
    for (let k = 0; k < 7; k++) { const a = jag(k, 9), b = Math.abs(jag(k, 11)); ctx.beginPath(); ctx.arc(X(wx) + a * 0.5 * S, Y(0) + b * 0.9 * S, Math.max(1.2, 0.025 * S), 0, 7); ctx.fill(); }
    ctx.beginPath(); ctx.arc(X(wx), Y(0), Math.max(4, 0.13 * S), 0, 7); ctx.fillStyle = '#FFFFFF'; ctx.shadowColor = '#5FE3C0'; ctx.shadowBlur = 22; ctx.fill();
    ctx.restore();
  }

  // Pitch gauge, bottom left: a quarter dial from 0 (edge on to the air) to 90 degrees (flat against it). The needle is
  // what her body is doing now; the open marker is the wing pitch the player has set, which G brings back; the zones are
  // wing, the blend, and flare. With the balance assist trimming her, the needle and the marker part company.
  function drawPitchGauge(game, cmd, tuning) {
    const cx = 34, cy = H - 30, r = Math.min(64, H * 0.2), ang = (d) => (-d * Math.PI) / 180;
    const from = tuning.blendFromDeg ?? 35, to = tuning.blendToDeg ?? 70, live = cmd.spread && !game.arcing();
    ctx.save(); ctx.globalAlpha = live ? 1 : 0.5; ctx.lineCap = 'butt';
    ctx.fillStyle = C.panel; ctx.globalAlpha *= 0.82; ctx.beginPath(); ctx.roundRect(8, cy - r - 24, r + 232, r + 46, 6); ctx.fill(); ctx.globalAlpha = live ? 1 : 0.5;
    for (const [a, b, col] of [[0, from, C.violet], [from, to, C.amber], [to, 90, C.rust]]) { ctx.beginPath(); ctx.arc(cx, cy, r, ang(a), ang(b), true); ctx.strokeStyle = col; ctx.lineWidth = 6; ctx.stroke(); }
    ctx.font = '10px ui-monospace, monospace'; ctx.fillStyle = C.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const d of [0, from, to, 90]) { const a = ang(d); line(cx + Math.cos(a) * (r - 5), cy + Math.sin(a) * (r - 5), cx + Math.cos(a) * (r + 5), cy + Math.sin(a) * (r + 5), C.ink, 1); ctx.fillText(String(d), cx + Math.cos(a) * (r + 14), cy + Math.sin(a) * (r + 14)); }
    const set = (cmd.wingPitch ?? 0) * 180 / Math.PI, now = live ? (cmd.pitch * 180) / Math.PI : set;
    const ms = ang(set); ctx.beginPath(); ctx.arc(cx + Math.cos(ms) * r, cy + Math.sin(ms) * r, 4.5, 0, 7); ctx.fillStyle = C.panel; ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.stroke();
    const an = ang(now); line(cx, cy, cx + Math.cos(an) * (r - 9), cy + Math.sin(an) * (r - 9), C.ink, live ? 3 : 1.5); ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, 7); ctx.fillStyle = C.ink; ctx.fill();
    line(cx + r + 22, cy, cx + r + 46, cy, C.muted, 1); ctx.beginPath(); ctx.moveTo(cx + r + 22, cy); ctx.lineTo(cx + r + 28, cy - 3); ctx.lineTo(cx + r + 28, cy + 3); ctx.fillStyle = C.muted; ctx.fill();   // the air comes from ahead
    ctx.textAlign = 'left'; ctx.fillStyle = C.ink; ctx.font = '600 20px ui-monospace, monospace'; ctx.fillText(`${now.toFixed(0)}°`, cx + r + 20, cy - r * 0.62);
    ctx.font = '11px ui-monospace, monospace'; ctx.fillStyle = C.muted;
    const what = game.arcing() ? 'arc: folded up' : !cmd.spread ? `narrow, G gives ${set.toFixed(0)}°` : cmd.flare || now > to ? 'flare' : now > from ? 'between wing and flare' : game.balance && game.balance.ok ? `wing, assist holds ${(game.balance.lead * 180 / Math.PI).toFixed(0)}° lead` : 'wing';
    ctx.fillText('pitch to the air', cx + r + 20, cy - r * 0.62 + 17); ctx.fillText(what, cx + r + 20, cy - r * 0.62 + 31);
    ctx.restore();
  }

  readTokens(); resize();
  return {
    resize, readTokens,
    draw(game, cmdIn, tuning = {}, marks = []) {
      const cmd = game.arcing() ? { ...cmdIn, spread: false } : cmdIn;
      const [hx, hy] = game.head(), [vx] = game.velocity();
      const wantH = Math.max(11.6, WIRE_H + hy + 3.5);              // widen when she climbs
      viewH += (wantH - viewH) * 0.08; S = H / viewH;
      const lead = clamp(vx * 0.35, 2, 10); camX += (hx + lead - camX) * 0.15;
      ctx.clearRect(0, 0, W, H); drawWorld(); if (game.arcing()) drawArc(game); drawAri(game, cmd, false);
      for (const m of marks) {                                       // a demo's key moments, numbered where they happened and left in place
        const r = Math.max(9, 0.22 * S); ctx.beginPath(); ctx.arc(X(m.x), Y(m.y), r, 0, 7); ctx.fillStyle = m.current ? C.rust : C.panel; ctx.globalAlpha = 0.92; ctx.fill(); ctx.globalAlpha = 1;
        ctx.strokeStyle = C.rust; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = m.current ? C.panel : C.ink; ctx.font = `600 ${Math.round(r * 1.1)}px ui-monospace, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(m.n), X(m.x), Y(m.y) + 0.5);
      }
      drawPitchGauge(game, cmd, tuning);
      const bx = W - 16 - 5 * S, by = H - 14; line(bx, by, bx + 5 * S, by, C.ink, 2); ctx.fillStyle = C.ink; ctx.font = '11px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.fillText('5 m', bx + 2.5 * S, by - 6);
    },
    snap(game) { camX = game.head()[0] + 6; },
  };
}
