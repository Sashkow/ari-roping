## Why

The Roping Ari simulations (`../radio_ocean/notes/scenes/ari-roping/`) solved a family of moves with a
small, honest physics core: a body on two poles whose tips ride the trolleybus wires.
Each move turned out to be a sequence of four or five control inputs, and the limits the
simulations found (brake only passes a 14 km/h bus, brake and pull 47 km/h, flare kick
and pull 63 km/h) already form a difficulty curve. Letting a player hold those controls
is the most direct way to feel why Ari is impractical on purpose, and it opens the one
state never simulated: off the wire with her wing open.

## What Changes

- A browser game, *Roping Ari*: side view, the player flies Ari along the two wires of a
  Kyiv trolleybus line and has to get past trolleybuses.
- Five player controls: tip throttle (accelerate or brake the pole tips along the wire),
  pole length (in the air it sets her spin), grip (release, and catch if a tip is at the
  wire), body spread or narrow, and body pitch (low pitch is the wing, full pitch is the
  flare). Optional assists: lifted-gait balance, sway damping, slow motion.
- The physics of `roping_sim.py` and `roping_gaits.py` ported to JavaScript, extended
  with what the solved runs prescribed or skipped: a spinning rigid body in flight whose
  spin follows pole length, lift and drag in flight (the wingsuit state), a grip-force
  limit on the tips, and a catch that succeeds only when a tip reaches the wire.
- Fail states that are already physics: the bus body and its poles, the road, the bus's
  collector shoes on her wires, crossing the 520 mm wire gap while spread, span wires at
  the supports, a load limit on her body, a lost grip.
- Levels by bus speed, a scripted first-attempt tutorial that lands on the bus roof,
  wind per level, scoring (speed kept, effort, margin, turns), and ghost replays of the
  solved Python runs.
- Rewards in two tiers (2026-09-23): every event acknowledged with its numbers, a badge
  once per kind of thing (skateboarding, not a ladder), lines of tokens with event
  windows, an unbounded "surprise the devs" table, controller and crash badges; every
  run recorded as a hand-editable text tab that replays on the page with numbered key
  moments, and a GIF rendered from the replay that carries the tab, so the devs store
  nothing. Candidate badges are demos first; the author picks.
- A parity check: control inputs exported from the Python runs, replayed through the
  JavaScript physics, must reproduce the Python track within a stated tolerance.
- Level and physics constants stay in YAML, in the style of
  `notes/scenes/ari-roping/configs/`; a build step produces one self-contained HTML page
  that can be published as an artifact and is recorded in `notes/demos.md`.
- No change to the radio render pipeline or to the three existing animation pages.

## Capabilities

### New Capabilities
- `roping-physics`: the real-time JavaScript physics of Ari on the wire and in the air,
  its limits (grip, load), the catch rule, and parity with the Python simulations.
- `roping-controls`: the player's inputs, their analog ramps on a keyboard, and the
  assists.
- `roping-levels`: levels, trolleybuses, wind, hazards and fail states, scoring, the
  tutorial, ghost replays exported from the solved runs, and (2026-09-23) rewards,
  lines, the tab, replay from a tab, and the GIF.
- `roping-game-page`: rendering, camera, HUD, the single-file build, and publication.

### Modified Capabilities

None. The existing specs describe the radio render pipeline, which this change does not
touch.

## Impact

- This repository, `repos/ari-roping/` (next to `repos/radio_ocean/`), holds the whole
  game and this change: JavaScript
  sources, YAML levels, build script, node tests, its own Makefile, README and
  `CLAUDE.md`. Nothing of the game lives inside `radio_ocean`. Node is already on the machine; no new Python dependency (PyYAML is in
  the venv).
- New export script beside the simulations,
  `../radio_ocean/notes/scenes/ari-roping/roping_export.py`, writing control inputs and trajectories of
  the solved runs to `../ari-roping/data/`, together with `constants.json`, the physics
  constants resolved from the simulations' `configs/baseline.yaml`, so that the game
  repository builds and tests without reading `radio_ocean`. `roping_sim.py` gains a recorded control
  trace; the published animation tracks must not change (checked by checksum, as in the
  earlier refactors).
- `repos/ari-roping/Makefile`: `make check` (node tests including parity) and `make build`;
  `radio_ocean`'s Makefile gains only `make export-roping`, kept out of `make check` so
  the 5 s local gate stays as it is.
- `../radio_ocean/notes/demos.md` gains a row when the page is published; `ari-roping.md` gains a short
  section pointing at the game.
- Disk: sources and data well under 5 MB, on `/home`; nothing under `/opt/ro`.
