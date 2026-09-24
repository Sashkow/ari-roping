## Context

`roping_sim.py` integrates a point mass on massless rigid poles whose tips move along
the wire with a *commanded* acceleration `a_p`; `Sim.step` returns the pole force it
took (`tension`) and the wire force along the tips (`wire_x = -tension·sin θ`) as
reported quantities. `roping_pulled.py` and `roping_two_gaits.py` script `a_p` per phase
(brake to a tip speed, hold a tip speed through the drive, and so on) and bisect the
phase parameters that make the move close. `roping_export.py` writes the constants, the
controls actually applied per attached segment (`data/parity/`) and a 50 Hz track
(`data/ghosts/`) to `repos/ari-roping/`, whose `physics.js` is a line-for-line port
checked by parity tests at the Python step.

Canon (`notes/ari.md`, "Her tips slide", 2026-09-23): the tips slide like a trolleybus
shoe and never roll; going and braking are the tip coils (induction, tens of newtons,
regenerative); the hard holds are her hands closing on the wire. Estimates made the same
day: coil thrust 30–120 N, shoe μ about 0.2 on copper, a head-sized clamp about 450 N
along the wire, launches needing about 240 N backward from the wire at the peak and the
hard brake with the pole pull 830 N. Decisions already taken: the hands are shoe plus
jaws, grip limit 450 N; jaws are proportional and automatic, never a control; parity
must hold at the real μ (the full model, not a game-side term); the pole load that
friction uses is the previous step's; coil thrust may fade below a few m/s.

## Goals / Non-Goals

**Goals:**
- One tip model in the Python, exact enough to port: a massive tip driven by bounded
  forces, from which tip acceleration emerges.
- The four solved runs re-solved on it, exported, and the treatment's numbers updated.
- Every new constant in the run configs, with its source, and in `constants.json`.
- The game can port the same equation and pass parity at μ 0.2.

**Non-Goals:**
- The game's port itself, its tuning, demos, belief rows and spec (follow-up in
  `repos/ari-roping/openspec/changes/roping-game/`).
- Static friction, stick-slip, wear, heating, or the wire's own dynamics (sag, waves).
- Losing the wire under load (the game's `hang_limit`). The Python reports the peak pole
  load against a configured hang limit and warns; it does not release.
- Redrawing the eleven frames.

## Decisions

**1. The tip is a mass on the wire.** The poles' mass (`body.poles_mass`, 1 kg) rides
the wire as a particle at the tips. Along the wire: `m_t · a_p = F_drive + F_shoe + T·sin θ`,
where `T·sin θ` is the pole's pull on the tip along the wire (the negative of today's
`wire_x`). Because `T` contains `−M·a_p·sin θ`, the step solves it in closed form:
`a_p = (F_drive + F_shoe + T₀·sin θ) / (m_t + M·sin²θ)` with `T₀` the tension at
`a_p = 0`. *Why:* with massless tips an along-wire force at the bottom of the swing has
nothing to push against (`sin θ = 0`) and the game guards a singularity there; the
poles' mass is real, already in the constants, and makes the equation well posed at every
angle. *Alternative:* keep `a_p` commanded and subtract a friction deceleration; rejected
because it is the same hack in two places and cannot say what the coils can and cannot
do.

**2. Three along-wire forces, two caps.** `F_drive` is what the controller asks for,
clamped to `[−(F_coil + F_grip), +F_coil]`: forward, only the coils can push (thrust);
backward, coils in reverse plus the jaws. `F_shoe = −μ · |T_prev| · sign(u)`, always on,
using the previous step's tension. *Why asymmetric:* friction and jaws can only oppose
motion; forward force beyond the coils is not something hands on a smooth wire can
supply. *Why stale `T`:* `T` depends on `a_p` and `a_p` on `F_shoe`; one step of lag
(0.1 ms) breaks the loop and matches how the game already staggers its clamp.

**3. Coil thrust fades at low tip speed.** `F_coil(u) = coil.thrust · min(1, |u| / coil.fade_speed)`,
default 10 N and 3 m/s. *Why:* induction needs relative motion; near standstill the
coils do little and only the jaws and the shoe remain. It also answers the design
question in the game ("should grip depend on tip speed"): the coil part does, the jaws
do not. *Alternative:* no fade; kept as `fade_speed: 0` for runs that want it off.

**3a. Coil thrust is 35 N and the poles weigh 3 kg (author, 2026-09-23, revised the
same evening).** A first sizing kept the poles at 1 kg and got 10 N of coil, but the
model showed that holding 79 km/h takes 20 N in the pulled gait (12.6 N of drive plus
7.6 N of shoe) and 32 N in the lifted gait (29 N: the wing's drag at 140 % lift, plus
3 N of shoe), so 10 N held neither and every run failed to close. The author chose to
size the coils to cruise: 35 N from about 0.9 kg of induction motor per tip at ~19 N/kg,
so `body.poles_mass` becomes 3.0 kg (two 0.6 kg rods, two 0.9 kg tips). Raised to 40 N
during the port: at 35 the lifted gait was 0.4 N short and slowed. The swing is
unchanged (the tips' mass rides the wire, it does not swing); the tip equation gets
`m_t = 3` and flight inertia rises. The heavy ends are canon now for another reason: a
tightrope walker's pole, her balance on a wire (`notes/ari.md`). *Alternatives
considered:* coils 10 N with cruise pumped continuously (honest to a light pole, but
every cruise phase becomes an oscillation and the composite pose a moment in a cycle);
coils 20 N with only the lifted gait pumped; exempting cruise from the caps as licence.
The pump stays as the way to gain speed faster than 35 N allows.

**4. Controllers command force, or an acceleration that is resolved to force.** `ctrl(t, th, om, u)` returns
`(cmd, mode, level)` where `cmd` is a force in newtons or `Accel(a)`: a wish for a tip
acceleration, which `step` turns into the force that would give it (from the same tip
equation, run backwards) before clamping. Implementation note (2026-09-23): `Accel` keeps
the scripts' brake parameters in m/s², the unit the scans, the notes and the game's throttle
use, while the physics stays force-driven; a helper `hold_speed(target, gain, u)` returns
`gain · (target − u)` for phases that chase a speed; the clamp of decision 2 is applied inside `Sim.step`, so a
controller can ask for more than the tips can give and get the slip. `Sim.run` records
both `f_cmd` and `f_applied` per row. *Why:* the scripts keep their shape (phases,
stops, bisections) and the parity export gets the applied force as the control, which
is what the game replays.

**5. Config keys, per run, under `tips:`.** `mass_from: body.poles_mass` (or a number),
`coil: {thrust: 10, fade_speed: 3.0}`, `grip: 450`, `shoe_mu: 0.2`, `hang_limit: 1000`
(reported only). Baseline carries the defaults with their sources in comments; scenario
files override. *Why:* the repository's rule that every physical assumption is data.

**6. Export.** `constants.json` gains the `tips` block; each parity segment's control
list carries `f_applied` (renamed from `a_p`), plus `mu`, caps and the tip mass at the
top, so the game replays the same forces through the same equation. Ghost tracks are
unchanged in format. The export refuses to write if any of the four solves failed to
close (a stop condition never met), so the game never receives a half-set.

**7. Numbers into the text.** `roping_numbers.py` prints the figures the beat table
quotes, plus the new ones: shoe drag at cruise in each gait, speed lost per launch,
peak jaw force, coil energy recovered in the brake. The beat table in `ari-roping.md`
is updated by hand from that output, and a line under the table says which model
produced it and the date. `notes/ari.md` "Her tips slide" replaces its rough figures
with the solved ones.

**8. Solve targets stay, tolerances loosen where slip is the point.** The release
angle, the back-swing target and the circle brake keep their targets. If a scenario's
launch needs more than the caps allow (the hard brake with the pull), the scan records
"slipped: asked X N, got Y" instead of failing, and `solved-params.json` keeps the best
closing launch. *Why:* the slip is the new physics, not an error.

**9. After the catch the tips cannot hold the swing; the giant circle is gone (found
2026-09-23).** At the catch she is 1.2 m above the wires and 2.1 m behind her tips and
swings under them with ~300 N on the poles; the along-wire pull on the tips is ~260 N,
which kinematic tips resisted silently. Real tips (35 N of coil, ~60 N of shoe) are
dragged by it. Two consequences. The run-out after every catch is the *anti-pump*: poles
short near the top of each swing and long through the bottom (`runout.anti_pump`), so
each swing gives energy back, with coil thrust applied only while the body swings forward
under the tips (`runout.calm_deg`), as a continuous law (`runout_force`: a step law smears
in the 1 kHz parity replay); she is back at cruise in 5–10 s. And
the two-gaits move loses its giant circle: with real tips the giant loaded the poles to
1036 N (over the hang limit) and dragged the tips backwards to −3.4 m/s. The lead is
then entered by the old recipe (tips past cruise on the coils, then eased back on the
jaws, which swings her forward), bracketed at 2–10 m/s of overshoot because the reach
is not monotone above that. *Why not keep the circle:* it is not a control problem, the
loads are the physics. The treatment's beats 9–10 change accordingly (task 5.2).

## Risks / Trade-offs

- [The solved moves may not close at grip 450 with μ 0.2] → the peak backward force at
  the launch is ~240 N, inside coils + shoe + jaws; if a scenario still misses, the scan
  reports it and the config's `grip` is the knob, changed with a note, not silently.
- [Numbers move and the frames no longer match their captions] → expected drift is a few
  per cent (a degree or two of release, a few tenths of a second); the captions in the
  beat table are updated, the drawings are not, and any frame whose pose visibly
  disagrees gets a line in the note's Frames section.
- [The game's parity tests fail from the moment of export until its port lands] →
  intended signal; the export is the last task here and the port is the first follow-up.
  Until then `make check` in `ari-roping` is red and says why.
- [Stale tension in the friction term] → one step of 0.1 ms lag at the Python step; the
  game at 1 ms may show a small difference on the parity replay. Parity tolerance is
  checked and, if the lag alone breaks it, the game runs the friction term with the same
  one-step lag (it is a port).
- [Coulomb friction chatters at u ≈ 0] → the tips never stop in any run; `sign(u)` is
  smoothed over ±0.05 m/s anyway.
- [Bisections become slower or non-monotone] → each scenario solve is seconds to
  minutes today; a force-driven tip adds one closed-form division per step. Monotonicity
  of the release-angle search is checked on the baseline before the other runs.

## Migration Plan

1. Land the tip equation with `shoe_mu: 0`, `grip` and `coil.thrust` very large: the
   runs must reproduce today's numbers to the tolerance of the parity test (a check that
   the new model contains the old one).
2. Set the real parameters, re-solve, compare, update text.
3. Export. Roll back by restoring `data/` in `ari-roping` from the previous export (it
   is regenerated by one make target) and reverting the configs.

## Open Questions

- μ: 0.2 is the trolleybus-insert figure and the baseline. The magnetite-and-slime tip
  (`ari.md`, Open, 2026-09-23) is solved beside it as `configs/slime.yaml` (0.05) and
  `configs/dry.yaml` (0.55, no slime); which of the three is canon is the author's.
- Coil fade speed: 3 m/s is a guess; only the settle phase gets near it.
- The pump as a controller: how many pumps, at what pole stroke, bring her from 60 to
  79 km/h, and whether the two-gaits run's settle phase already does it.
- Whether the lifted-gait pages (`gaits.html`) need friction at all: the gait model in
  `roping_gaits.py` is a static balance, and shoe drag enters it as a small extra axial
  force. Decide when the numbers are in.
