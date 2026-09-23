// Scripted keys for the solved techniques: the watch mode of the page and the playtests in node.
// Each returns the `keys` object of input.js for the current state of the game.
import { rad } from './util.js';

export const autopilots = {
  // brake a little, pull the poles in through the bottom of the swing, let go near 60 degrees, reach on the way down
  brakeAndPull(g) {
    const k = {}, geo = g.world.geom();
    if (g.mode === 'wire' && g.catches === 0) {
      const gap = geo.shoes - g.st.x;
      g.ap ??= { go: false };
      if (gap < 16.5) g.ap.go = true;
      if (g.ap.go) { k.left = true; if (g.st.th > rad(-10)) k.up = true; if (g.st.th >= rad(58)) k.grip = true; }
    } else if (g.mode === 'air') {
      if (g.fl.l < 2.39 && !(g.fl.vy < 0)) k.down = true;        // let the poles out: the half turn needs the slow spin
      if (g.fl.vy < 0 && g.fl.y < 1.4) k.grip = true;            // reach for the wire on the way down
    } else {
      k.right = g.st.u < g.startSpeed - 0.3;                     // back up to speed
      if (g.l < 2.39) k.down = true;
    }
    return k;
  },

  // the same launch, then the hoop: keep pulling in after the poles are fully in, roll over the bus as a ring, and hold grip
  // on the way down: she picks the instant to open herself, and her poles come round onto the wire
  brakePullHoop(g, opt = {}) {
    const k = {}, geo = g.world.geom();
    if (g.mode === 'wire' && g.catches === 0) {
      g.ap ??= { go: false };
      if (geo.shoes - g.st.x < (opt.gap ?? 16.5)) g.ap.go = true;
      if (g.ap.go) { k.left = true; k.hard = !!opt.hard; if (g.st.th > rad(-10)) k.up = true; if (g.st.th >= rad(opt.release ?? 58)) k.grip = true; }
    } else if (g.mode === 'air') {
      const commit = g.fl.vy < 0 && g.fl.y < (opt.commit ?? 1.6);
      if (commit) k.grip = true; else k.up = true;                 // pull in, and keep pulling: the hoop
    } else {
      k.right = g.st.u < g.startSpeed - 0.3;
      if (g.l < 2.39) k.down = true;
    }
    return k;
  },
};
