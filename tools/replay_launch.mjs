import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { makeGame } from '../src/game.js';
const { physics } = JSON.parse(readFileSync(new URL('../data/constants.json', import.meta.url)));
const level = JSON.parse(execFileSync('/opt/ro/venv/bin/python', ['-c','import json,yaml,sys; print(json.dumps(yaml.safe_load(open(sys.argv[1]))))', new URL('../levels/base.yaml', import.meta.url).pathname]));
for (const f of process.argv.slice(2)) {
  const r = JSON.parse(readFileSync(f)).plan, g = makeGame(physics, level), dt = level.tuning.step; g.assistOn = false;
  let rel = null, peak = 0;
  while (!g.over && g.t < 12) {
    let cmd = { accel: 0, poleRate: 0, spread: false, pitch: 0, gripPressed: false, flare: false };
    if (g.mode === 'wire' && !rel) {
      const t = g.t;
      if (t < r.tAcc) { cmd.accel = r.a1; cmd.poleRate = Math.sign(r.lStart - g.l) * Math.min(6, Math.abs(r.lStart - g.l) / dt); } else { cmd.accel = r.a2; if (g.st.th > r.thPull) cmd.poleRate = -r.pull; if (t < r.tAcc + r.tFlare) { cmd.spread = true; cmd.flare = true; cmd.pitch = Math.PI / 2; } }
      const [vx, vy] = g.velocity();
      if (g.out) peak = Math.max(peak, Math.abs(g.out.tension) / (4 * 9.81));
      if (t > r.tAcc && g.st.om > 0 && vy > 0 && (r.course == null ? g.st.th > 0 && Math.atan2(vy, vx) >= Math.PI / 4 : Math.atan2(vy, vx) >= r.course)) { cmd.gripPressed = true; rel = { t, v: Math.hypot(vx, vy), vx, vy, th: g.st.th * 180 / Math.PI, u: g.st.u, l: g.l }; }
    }
    if (g.mode === 'air' && r.course != null && g.fl.vy > -1) {            // the climb of a height recipe: wing, or hoop
      const ta = g.airTime; if (g.opened == null && g.fl.y > r.wingAbove) g.opened = ta;
      const want = g.opened != null && ta < g.opened + r.wingFor;
      cmd.spread = want; cmd.pitch = r.wingPitch; cmd.poleRate = r.hoop && !want ? -6 : 0;
    }
    g.step(cmd, dt);
  }
  const [hx] = g.head();
  console.log(f, JSON.stringify(rel, (k, v) => typeof v === 'number' ? +v.toFixed(2) : v), 'peak g', peak.toFixed(1), 'apex above wire', g.apex.toFixed(1), 'airtime', g.airTime.toFixed(1), 'ended:', g.over, 'at x', hx.toFixed(0), 'bus front', g.world.geom().front.toFixed(0));
}
