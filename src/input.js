// The player's five controls as commands, independent of the device. Digital keys drive analog commands
// through ramps, so a keyboard can give a gentle brake or a hard one. A gamepad or the autopilot fills the
// same `keys` object. keys: left right up down grip flare wing pitchUp pitchDown hard slow (booleans).
import { rad, clamp } from './util.js';

export function makeCommands(cfg) {
  const c = { accel: 0, poleRate: 0, grip: false, gripPressed: false, spread: false, pitch: rad(90), slow: false, wingOn: false, wingPitch: rad(25),
              flare: false, lead: rad(cfg.balance ? cfg.balance.lead_deg : 65) };
  let prevGrip = false, prevWing = false, prevPadGrip = false, prevPadWing = false;
  return {
    state: c,
    /** The arc folds her up: the wing switches off and has to be switched on again afterwards. */
    cancelSpread() { c.wingOn = false; c.spread = false; },
    /** keys: the keyboard (or autopilot); pad: an optional reading from gamepad.js, whose sticks are the commands themselves. */
    update(keys, dt, pad) {
      const target = ((keys.right ? 1 : 0) - (keys.left ? 1 : 0)) * cfg.throttle_full * (keys.hard ? 2 : 1);
      const rate = (cfg.throttle_full * (keys.hard ? 2 : 1)) / cfg.throttle_ramp;
      c.accel += clamp(target - c.accel, -rate * dt, rate * dt);
      c.poleRate = ((keys.down ? 1 : 0) - (keys.up ? 1 : 0)) * cfg.pole_speed;          // up pulls the poles in, down lets them out
      c.gripPressed = !!keys.grip && !prevGrip; prevGrip = !!keys.grip; c.grip = !!keys.grip;
      if (keys.wing && !prevWing) c.wingOn = !c.wingOn; prevWing = !!keys.wing;
      c.wingPitch = clamp(c.wingPitch + ((keys.pitchUp ? 1 : 0) - (keys.pitchDown ? 1 : 0)) * rad(cfg.pitch_rate_deg) * dt, rad(2), rad(35));
      if (cfg.balance) c.lead = clamp(c.lead + ((keys.pitchUp ? 1 : 0) - (keys.pitchDown ? 1 : 0)) * rad(cfg.balance.lead_rate_deg) * dt, rad(cfg.balance.lead_min_deg), rad(cfg.balance.lead_max_deg));
      c.flare = !!keys.flare;
      c.spread = !!keys.flare || c.wingOn;
      c.pitch = keys.flare ? rad(90) : c.wingPitch;
      c.slow = !!keys.slow;
      if (pad) {
        const full = cfg.throttle_full * 2;                                   // the whole stick: from a touch of brake to the hard one
        if (pad.speed !== 0) c.accel = Math.sign(pad.speed) * Math.abs(pad.speed) ** 1.5 * full;
        if (pad.pole !== 0) c.poleRate = -pad.pole * cfg.pole_speed;          // stick up pulls the poles in
        const gripNow = !!keys.grip || pad.grip; c.gripPressed = gripNow && !prevPadGrip; prevPadGrip = gripNow; c.grip = gripNow;
        c.flare = !!keys.flare || pad.flare;
        if (pad.wing != null) {                                               // a switch or button of its own for the wing (G): the stick then only sets its pitch, over its whole travel
          if (pad.wingToggles) { if (pad.wing && !prevPadWing) c.wingOn = !c.wingOn; } else c.wingOn = pad.wing;
          prevPadWing = pad.wing;
          c.wingPitch = rad(pad.liftTopDeg ?? 90) * pad.lift;
        } else if (cfg.pad_lift !== false) {                                  // the lift stick is the whole body control, by position: narrow at the bottom, then the wing, its pitch rising to the flare at the top
          c.wingOn = pad.lift > 0.03;
          c.wingPitch = rad(pad.liftTopDeg ?? 90) * pad.lift;
        }
        c.spread = c.flare || c.wingOn;
        c.pitch = c.flare ? rad(90) : c.wingPitch;
      }
      return c;
    },
  };
}
