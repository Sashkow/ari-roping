// The JavaScript physics must be the simulations' physics: replay the controls the Python runs actually
// applied and compare trajectories on every attached segment. Tolerance from the spec: 5 cm, 1 degree.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { makePhysics } from '../src/physics.js';

const DATA = new URL('../data/', import.meta.url);
const constants = JSON.parse(readFileSync(new URL('constants.json', DATA)));

test('constants.json is not older than the simulations\' baseline.yaml', (t) => {
  const src = new URL('../../radio_ocean/notes/scenes/ari-roping/configs/baseline.yaml', import.meta.url);
  if (!existsSync(src)) return t.skip('radio_ocean is not next to this repository');
  const sha = createHash('sha256').update(readFileSync(src)).digest('hex');
  assert.equal(sha, constants.source_sha256, 'baseline.yaml changed: run `make export` (radio_ocean: make export-roping)');
});

const lerp = (a, i, f) => a[i] + (a[Math.min(i + 1, a.length - 1)] - a[i]) * f;

for (const file of readdirSync(new URL('parity/', DATA)).filter((f) => f.endsWith('.json')).sort()) {
  const run = JSON.parse(readFileSync(new URL('parity/' + file, DATA)));
  test(`parity: ${run.name} (${run.note})`, () => {
    assert.deepEqual(run.physics, constants.physics, 'the run was solved with other physics constants than constants.json');
    const P = makePhysics(run.physics);
    let worstPos = 0, worstAng = 0;
    run.segments.forEach((seg, k) => {
      const c = seg.controls, st = { ...seg.start };
      for (let i = 0; i < seg.steps; i++) {
        const j = Math.floor(i / c.every), f = (i % c.every) / c.every;
        const ctl = { aP: lerp(c.a_p, j, f), l: lerp(c.l, j, f), dl: lerp(c.dl, j, f), mode: c.mode[j], level: lerp(c.level, j, f) };
        P.stepAttached(st, ctl, run.dt);
        if ((i + 1) % seg.ref.every === 0) {
          const r = (i + 1) / seg.ref.every - 1;
          const l = seg.ref.l[r];
          const hx = st.x + l * Math.sin(st.th), hy = -l * Math.cos(st.th);
          const rx = seg.ref.x[r] + l * Math.sin(seg.ref.th[r]), ry = -l * Math.cos(seg.ref.th[r]);
          worstPos = Math.max(worstPos, Math.hypot(hx - rx, hy - ry));
          // the Python runs re-wrap the angle by whole turns between phases (after the full circle); compare modulo a turn
          const d = (((st.th - seg.ref.th[r]) * 180 / Math.PI + 180) % 360 + 360) % 360 - 180;
          worstAng = Math.max(worstAng, Math.abs(d));
        }
      }
      assert.ok(worstPos < 0.05, `segment ${k}: head position off by ${worstPos.toFixed(3)} m`);
      assert.ok(worstAng < 1.0, `segment ${k}: pole angle off by ${worstAng.toFixed(2)} deg`);
    });
    console.log(`    ${run.name}: worst head position error ${(worstPos * 100).toFixed(2)} cm, worst pole angle error ${worstAng.toFixed(3)} deg`);
  });
}
