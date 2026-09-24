## Why

The roping simulations (`notes/scenes/ari-roping/roping_sim.py` and the scripts on it)
drive Ari's pole tips kinematically: the controller commands a tip acceleration and the
wire force is only reported, so grip is infinite and the tips are frictionless. The
treatment names that as its main assumption. Canon now says how the tips actually ride
the wire (`notes/ari.md`, "Her tips slide", 2026-09-23): they slide like a trolleybus
shoe and never roll, going and braking are induction in the tip coils, and the hard holds
are her hands closing on the wire. The game (`repos/ari-roping/`) needs those forces as
play (a grip limit that acts, a launch that costs speed, a lifted gait that is cheaper
to ride), and its parity tests must keep matching the Python to the last digit. The only
way to have one model and one set of numbers is to put the tip dynamics into the
simulations first and let the game port them.

## What Changes

- **Tips become a force-driven mass on the wire.** The poles' 1 kg rides the wire and
  is driven by three along-wire forces: coil thrust (bounded, regenerative, symmetric,
  optionally fading below a few m/s of tip speed), jaw friction (proportional and
  automatic, up to a grip limit), and shoe friction (μ × |pole load| against the tips'
  motion, always on). Tip acceleration is an output, not an input. The pole load used by
  friction is the previous step's, for stability.
- **Controllers command thrust, not acceleration.** `roping_pulled.py` and
  `roping_two_gaits.py` script a tip force; the bisections that solve the release angle,
  the brake match and the circle brake run on the new model. **BREAKING** for anything
  that called `Sim.step` with `a_p`.
- **Configs carry the tip parameters** per run: tip mass, coil thrust, its fade speed,
  grip limit, shoe μ. Defaults from today's estimates: 1 kg, ±10 N (what 200 g of motor per tip can make), 450 N, 0.2. Forward acceleration beyond the coils is the pole pump, a new controller phase.
- **The four runs are re-solved and re-exported** (`make export-roping`): constants,
  parity segments and ghost tracks in `repos/ari-roping/data/`, with the tip parameters
  in `constants.json` so the game's port is checked at μ 0.2, not 0.
- **The numbers in the text follow the model.** `ari-roping.md` (beat table and the
  section on assumptions), `notes/ari.md` "On the wire" (the derived consequences of
  sliding get their solved values), `roping_numbers.py`, the gaits pages. The eleven
  frames stay unless a number moves past what the drawing shows.
- **Not in this change, listed as follow-up:** the game's port (`physics.js`), its level
  tuning, the demos rerun, the belief rows, design decision 3 and the physics spec of
  the `roping-game` change in `repos/ari-roping/`.

## Capabilities

### New Capabilities
- `roping-tip-dynamics`: how the pole tips ride the wire in the roping simulations: a
  massive tip driven by coil thrust, jaw friction and shoe friction, the parameters each
  run declares, and what the export hands to the game.

### Modified Capabilities

(none; no existing spec covers the roping simulations)

## Impact

- `notes/scenes/ari-roping/roping_sim.py`: the tip equation; `roping_pulled.py`,
  `roping_two_gaits.py`: controllers and solves; `roping_numbers.py`: printed figures;
  `roping_export.py`: tip parameters into `constants.json`; `configs/*.yaml`: new keys;
  `solved-params.json`: re-solved.
- `repos/ari-roping/data/constants.json`, `data/parity/*.json`, `data/ghosts/*.json`
  are regenerated. The game's parity tests will fail until its port lands (the
  follow-up), which is the intended signal.
- Prose: `notes/scenes/ari-roping/ari-roping.md`, `notes/ari.md`, the pages
  `gaits.html`, `ari-roping-pulled.html`, `ari-roping-two-gaits.html` if their figures
  are regenerated; `notes/demos.md` rows if a page is republished.
- No new dependencies. Solve time stays in minutes (the two-gaits solve is 12 s today).
