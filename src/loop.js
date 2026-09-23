// SPDX-License-Identifier: GPL-3.0-or-later
// Fixed-step clock: the physics always advances in whole steps of dt, however often frames arrive, so the
// same inputs give the same flight on every machine. Inputs are read per step, by simulation time.

export function makeClock(dt, maxStepsPerFrame = 250) {
  let acc = 0, steps = 0;
  return {
    /** Add elapsed real seconds (times any slow-motion factor); calls step(simTime) for each whole step. */
    advance(elapsed, step) {
      acc += elapsed;
      let n = 0;
      while (acc >= dt && n < maxStepsPerFrame) { step(steps * dt); steps++; acc -= dt; n++; }
      if (n === maxStepsPerFrame) acc = 0;            // a stalled tab does not get to catch up in one frame
      return n;
    },
    get time() { return steps * dt; },
    get steps() { return steps; },
  };
}
