## Context

`../radio_ocean/notes/scenes/ari-roping/` holds a point-mass simulation of Ari on her two poles:
`roping_sim.py` (one pendulum step with wing, flare, narrow-body and pole drag; a phase
runner), `roping_gaits.py` (slender-wing lift model, steady gaits), three solved moves
with their YAML configs, and three published animation pages that share one canvas
renderer (world, trolleybus, bowed poles, flare streaks, follow camera, `#shot=N` still
mode). In every solved run the tip speed along the wire is prescribed by a rule, the
flight is a parabola with a prescribed spin and no lift, the catch happens by
construction, and four things are automatic: the lifted-gait balance, the matched tip
brake of the drop, the sway damping after a catch, and the trim of her turn in the air.

The runs established the numbers the game is built on: pulled gait hangs 19° back at
79 km/h; the lifted gait exists from 65 km/h, is an inverted pendulum (wobble grows over
about 0.6 s) and cannot be entered by lift alone; brake only needs 3 g and passes at most
a 14 km/h bus; brake and pull 0.7 g and 47 km/h; flare kick and pull no brake and
63 km/h; the tips carry up to 440 N along the wire; the contact wires are 520 mm apart
(ДБН В.2.3-18:2007) and 5.8 m up; her body is about 0.35 m wide when spread.

Constraints: the published page must be one self-contained HTML file (artifact CSP: no
fetches, scripts only from a short CDN list); disk on `/home` is limited (19 GB free on
2026-09-20, `CLAUDE.md` still says 1.5 GB), so no node toolchain is installed; node and
chromium exist on the machine; the local gate `make check` must stay at about 5 s.

## Goals / Non-Goals

**Goals:**
- Every move solved so far is performable by a player with five controls, and nothing
  the player does is scripted except the tutorial's opening.
- The game's physics is the simulations' physics: same equations, same constants from
  YAML, verified by replaying Python control inputs through the JavaScript core.
- The physics limits are the difficulty: bus speed decides which technique is needed.
- The wingsuit state (off the wire, wing open) becomes playable and honest enough to
  discover gliding hops and a flared catch.
- One page, keyboard first, playable in the artifact viewer at 60 fps.

**Non-Goals:**
- No third dimension: no crosswind, no sideways motion; the 520 mm gap is a rule, not
  geometry.
- No pole bending, wire sag, hanger ears, or electrical model beyond the short-circuit
  rule.
- No touch controls, sound or music in this change (the ДахаБраха cue of
  `ari-roping.md` section 9 needs a licence; the page only leaves a hook for audio).
- No multiplayer, accounts or server; scores live in the browser only.
- No change to the three animation pages or their tracks.

## Decisions

**1. Home and build.** The game is its own repository, `repos/ari-roping/`, a sibling
of `repos/radio_ocean/` (author's decision, 2026-09-20), with ES modules in `src/` (`physics.js`,
`aero.js`, `world.js`, `input.js`, `levels.js`, `render.js`, `hud.js`, `main.js`), level
and physics YAML in `levels/`, exported runs in `data/`, and `build.py`, which resolves
`extends:`, converts YAML to JSON, bundles the modules and data into
`dist/roping-ari.html`. The two repositories meet at one seam: `radio_ocean` exports
(`make export-roping`) the solved runs and a resolved `constants.json` into
`../ari-roping/data/`, and those files are committed in the game repository, so it
builds and tests alone. *Why its own repository:* the game has sources, tests, a build
and a life of its own; `radio_ocean` is the radio renderer, and its notes hold
treatments and sketches. This OpenSpec change lives in the game repository (moved here
on 2026-09-20 at the author's request); paths into the simulations are written
`../radio_ocean/...`. *Why a Python build
script and no bundler:* PyYAML is already in the venv, the bundle is a concatenation of a
dozen modules, and a node toolchain would cost disk on `/home`. The game repository's
Makefile takes the interpreter from a `PYTHON` variable that defaults to
`/opt/ro/venv/bin/python`; any Python with PyYAML will do.

**2. Physics port, fixed step.** `physics.js` is a line-for-line port of `Sim.step`
(semi-implicit Euler, same force list, same tension formula) and `aero.js` of
`Gaits.wing`. The game integrates at 1 ms with an accumulator, several steps per frame;
the parity test runs the same code at the Python step of 0.1 ms. *Alternative:* RK4 at a
coarser step; rejected because parity with the Python runs is worth more than step
economy, and 1 ms costs well under a millisecond of CPU per frame.

**3. Tips as a mass on the wire: coils, shoe, jaws (rewritten 2026-09-23; the port of
`radio_ocean` change `roping-tip-dynamics`).** The tips are the poles' 3 kg riding the
wire. The throttle is still a wished tip acceleration, but it is resolved to the force that
would give it and clamped to what the tips have: **coils**, induction, 40 N forward or
back, fading below 3 m/s (what 0.9 kg of motor per tip makes on a 13 mm copper wire, sized
to hold 79 km/h in either gait); **jaws**, the hands closing on the wire, up to 450 N
backward only, proportional and automatic, never a control; the **shoe**, sliding
friction μ·|pole load| against the tips' motion, μ 0.2, always on. Tip acceleration is
`(f_applied + f_shoe + T₀·sinθ)/(m_tip + M·sin²θ)`, the same equation as the Python.
Beyond the caps the tips slip: they deliver the cap and the HUD says so. The hang-load
limit (forced release) stays as tuning. All tip values come from `constants.json`
`physics.tips`; a level may override under `tips:`. *Why:* the solved runs now use this
model and parity requires the same one; it makes a launch cost what it costs (the jaws
peak at 270–320 N of 450), makes the hard brake with the pole pull slip (833 N asked of
490), and, after a catch, means the tips cannot hold against the swing, so the player
kills it the gymnast's way (poles short near the top of each swing, long through the
bottom). *Earlier form:* a single grip limit on a kinematic tip, set impossibly high;
kept as the `kinematic-baseline-2026-09-23` tag and `game-kinematic.html`.
*What the tip is (author, 2026-09-24):* one mechanism in three states. A **C** for
riding: lips in the wire's overhang band, the 3 mm between the groove line where the
hanger clamps stop and the wire's equator, so the hang is by shape and every clamp is
passed; the lips in five segments that a clamp wedges open one at a time, passively. A
**ring** for turning: closed over the top, the wire as axle, so the full revolution
between the wires needs no wheel (~1000 N, 8 J a turn); opened to the C before a
support. **Open** for the catch. The coils share the segments and the shape: C-cores round
the wire's lower three quarters (a tubular induction motor open at the top), closed to a
full one in the ring state. Consequences for the model: `hang_limit` is the lips'
strength, not friction; the shoe is the coil pads' light contact, μ 0.2 on the pole
load as modelled; the supports cost the tips nothing, and the span-wire zone of task
4.2 is about the cross-span above the wire, not the clamp on it. Drawn on the page
"Pinch Tip on Grooved Wire" (`radio_ocean/notes/demos.md`).

**4. Flight is a spinning rigid body, and the hoop is the far end of the pole control**
(hoop: author's decision, 2026-09-20). State `(x, y, vx, vy, φ, L, l, curl)`, angular
momentum `L` conserved, spin `L / I`, so pole length is the spin control. In line, `I` is
the simulations' `inertia(l)`. Holding "pull in" for a moment (`hoop.hold`, 0.12 s) with
the poles already at their shortest, in the air and narrow, curls her into the hoop of the
solved runs over `hoop.time` (0.2 s): tail over, the fluke holding both pole tips, a ring
about 0.57 m across whose inertia is the simulations' ring value, so she spins about 2.3
times faster than straight at the same pole length (6.7 times her full-length spin). Her
inertia blends between the two as she closes. The hoop is compact (it clears what a 1.8 m
spinning line would clip) and its poles add no drag, but it is a commitment: her poles are
held, so "let out", grip and spread all have to uncurl her first, which takes the same
0.2 s and slows her spin as she opens. Staying a little above the shortest length keeps her
straight with free poles: the careful option. No new control. **She times the opening herself** (author, 2026-09-20: in the hoop she turns several times
a second, and picking the instant to open is not humanly possible). When grip goes down in
the hoop she plans once: for every instant of her next turn (4 ms apart, at most 0.6 s) she
runs the rest of the flight ahead on a copy of her state, opening and reaching from that
instant, and keeps the one that catches with her tips landing ahead of her, softly, with
the least speed left along the poles, and soonest, in that order of weight. She stays
curled until then; releasing grip cancels the plan. If no instant catches she opens at
once. Over 24 press timings on one hop this took tips-ahead catches from 9 to 22 and soft
ones from 7 to 20. It is on by default (`hoop_auto_open`); the player's skill stays in
deciding when to commit, how high, and how fast. *Alternatives:* a drawing
only, as first planned, rejected because it left the game's fastest spin at under half of
the solved runs'; a sixth key for the hoop, rejected to keep the author's five controls.
*Alternative for the spin as a whole:* the prescribed, trimmed spin of the solved runs;
rejected because the catch would then not be a skill.

**5. Body: spread or narrow, plus pitch.** One toggle and one axis replace "flare
on/off": spread at low pitch is the wing (`Gaits.wing` at that angle of attack), spread
at full pitch is the flare (`flare_k`), with a smooth blend between about 35° and 70°;
narrow is `narrow_cda`. On the wire pitch is measured against the airflow, as in the
simulations.

**6. Wing in flight: declared simplification.** Spread in the air, her body sets its
angle of attack against the airflow by the pitch axis, independent of the poles (the
neck decouples them, as it does in the lifted gait), and the spread body damps the
system's spin with a time constant from YAML (default 0.4 s). *Why:* a flat plate
tumbling through all angles of attack is neither playable nor what an animal would do;
the honest part that is kept is that lift, drag and the loss of spin all come from the
same spread body. Marked as an open question for a later, better model.

**7. The catch: she reaches for the wire** (author's idea, 2026-09-20). Once grip has
been pressed in the air her poles run toward the wire along the direction they point, lengthening
or shortening at a reach speed from YAML (default 14 m/s, against 6 m/s for the ordinary
pole control). The length they run to is the distance to the wire along that direction,
`-y / sin φ`; if the wire is out of range or the poles point away from it they run to
full length and stay there, so her own roll can still sweep the tips onto the wire, which
is how the solved runs catch. Contact is tested every step as the tip crossing the wire
plane; on contact she is attached at the length reached, the tips start at her horizontal
speed, the swing rate comes from her velocity across the poles, and the speed along the
poles, which now includes the reach itself, is absorbed up to a limit (default 8 m/s),
beyond which the catch is "hard" and counts against the body-load limit. One press starts it
and it lasts until she has the wire (author, 2026-09-20: a single press, not a hold); a
second press before contact calls it off and leaves the poles where they are, which keeps
the way out that holding gave. While she is reaching, pole length and spread are hers, not
the player's. *What it costs the player:* pole
length is her spin control, so reaching early lengthens the poles and kills the turn she
may still need, and long poles sweep into the bus's poles and the span wires.
*Alternative considered:* grip succeeds only if a tip is within 15 cm of the wire at the
press; rejected as a window of a few hundredths of a second at half a turn per second.

**8. Hazards as geometry.** Bus body rectangle, bus poles as two segments from the roof
base to the shoes, shoes as a point on the wire that attached tips cannot pass, the
road, a span-wire zone at each support (0 to 0.6 m above the wires, ±0.3 m), and the
wire plane itself: crossing it while spread touches both wires. That does not end the run
(author, 2026-09-20): 600 V strikes an arc between her and the wire that burns for 3 s
(`arc_seconds`), and while it burns she is folded up, narrow, unable to flare or fly, her
wing switched off until the player switches it on again. The cost is physical and
immediate, no lift and no air brake at the moment she most likely wanted them, and the
run goes on. Her body is a capsule of
its drawn length; the poles are segments. *Why a rule for the gap:* in a side view the
gap has no width; the rule carries the 520 mm against her 0.35 m.

**9. Levels and constants in YAML.** `levels/base.yaml` extends the physics constants of
the exported `data/constants.json` (resolved from the simulations'
`configs/baseline.yaml` by `roping_export.py`; regenerate it when that file changes; the
export stamps it with the source file's checksum and the parity test refuses a stale
one), and each level overrides bus speed, bus count and spacing, wind,
start gait and speed, assists allowed, and par values. Level ladder by bus speed: 11,
25, 40, 47, 55, 63 km/h, then wind variants and a lifted-gait level.

**10. Ghosts and parity from one export.** `roping_sim.py` records, per step, the
controls actually applied (tip acceleration, pole length, body mode and level, grip
events). `roping_export.py` writes, per solved run, the control trace and the 50 Hz
trajectory. The game draws a ghost from the trajectory (kinematic playback); the parity
test feeds the control trace to `physics.js` in node and compares trajectories.
Tolerance: 5 cm and 1° over the attached phases at 0.1 ms; flight compared up to the
release only, since the game's flight model differs on purpose (decision 4).

**11. Input.** Keyboard first: ← → throttle, ↑ ↓ pole length, Space grip, F spread, W S
pitch, Shift doubles the throttle ramp, Tab holds slow motion. Digital keys drive analog
commands through ramps (throttle 0 to full in 0.25 s, pitch 90°/s, pole length 6 m/s as
in the pumping experiment). Gamepad mapping through the same command layer in a late
task. Assists are toggles with per-level permission: balance (the simulations' PD rule
on angle of attack), sway damping (tips follow the swing), slow motion (0.4×).

**12. Renderer.** `render.js` starts as a copy of the drawing functions of
`ari-roping-two-gaits.html` (world, bus, Ari with bowed poles and flare streaks),
extended with several buses, the ghost, hazard flashes and a zoom that widens with speed
and in flight. *Why copy:* the animation pages are self-contained published files and
stay untouched.

**13. Scoring.** Per bus passed: speed kept (exit speed over entry speed), effort (work
done along the poles plus energy through the tips, from the same quantities the pages
already display), margin ahead of the windscreen, turns, no assist bonus. Stored in
`localStorage` with try/catch; the page works without it.

**14. Two tiers: a number is an acknowledgement, a shape is a badge (author,
2026-09-23).** The game is skateboarding, not a ladder: there are many ways to be cool
and none ranks above another. So nothing is rewarded for being *bigger*. An
acknowledgement is what a number gets: every time, as a toast and on the result card,
with the numbers ("over the bus at 1.3 g, apex 4.1 m"), never pausing the run, in the
devs' voice. A badge is what a *kind* of thing gets: once per browser, persisted,
named for its content, with a sparkle. A higher hop is the same shape as the first hop:
it gets the acknowledgement and a note that the badge is already held. The one
unbounded tier is "surprise the devs": there a number *is* the shape, because each
number is a belief the design wrote down, and beliefs are one-offs; a player who keeps
proving the design wrong keeps earning. Acknowledgements are frequent, badges rare.
Text is always the devs'; the sparkle (sparks from her pole tips, the arc drawing
reused) is the only thing that is hers, and it comes only with a badge. The game
auto-pauses only for a surprise and for a crash. Candidate badges are not written as
badges: each is first made as a demo (decision 17) and the author picks from the demos.

**15. Lines.** A line is a sequence of transitions with windows between them. The
transitions are tokens the run already computes: REL (let go, by hand or forced),
CATCH.reach / .sweep / .hard, SPREAD, NARROW, FLARE, CURL, OPEN, PULL, REACH, APEX,
TURN, ARC, LIFTED.enter / .hold(t), PASS. A line is declared in `levels/base.yaml`:
ordered tokens, a window after each, forbidden tokens in between. Windows are
**events, not clocks**: on the wire, "before her pole angle passes back through zero"
or a number of zero-crossings; in the air, "within this flight" or a number of turns;
seconds only as an optional hard cap for lines that are about human tempo. *Why not
seconds or swings:* the swing period changes with pole length, amplitude and lift, and
a hoop has no swing; the physical constraint ("lifted before she swings back behind
her tips") is an event. A token counts only if it did something: SPREAD if the wing did
work before the next token, CURL if the spin rose, PULL if the poles moved more than a
few centimetres; otherwise a player farms tokens by mashing keys. The live token string
in the HUD is an acknowledgement; a named line is a badge; an unnamed line of five or
more distinct tokens is acknowledged and its tab kept. Names and surprise rows are the
author's only.

**16. The tab, and replay.** The record of a run is text a person can read, paste and
edit, like guitar tablature: a header (build id, constants checksum, level, bus speed,
wind, input device); one line per *input* change (keys and stick positions, quantised
to 1/100 and thinned to changes, at most one per 10 ms per control), replayed through
the same command layer and ramps; `#` lines for each token with its numbers (seconds
and the event window where one applies); a checkpoint at each token and at the end
(time, position, a hash of the state). *Why inputs, not commands:* a hand-written tab
should read like playing; the build id covers changes to the ramps. The fixed 1 ms
step makes the tab reproducible, but `Math.sin`, `exp` and `atan2` differ across JS
engines by an ulp and the lifted gait amplifies any error, so a replay can drift; the
checkpoints locate the drift and the page shows the drifted replay with a warning
naming the time and the distance. `#tab=` opens the game page with the tab as the
autopilot, the same path as `#watch`, with the moments UI of the two-gaits page
(numbered key moments from the `#` lines, stop at moments, a card of numbers per
moment, `#shot=N`). The devs store nothing: the player keeps the tab and the GIF.

**17. The GIF is the witness, the tab is the reproduction.** A GIF is rendered from the
replay after the run, never captured live, so the frame rate of play is irrelevant:
small palette, about 15 fps, 320 px, the key-moment numbers stamped at her head and
left in place so the last frame is a diagram of the line, the token string as a
caption. The tab is written into the GIF's comment block (and into a PNG text chunk for
the still of the last frame), so the image is the save file: drop it on the page and
it replays. Made on request from any badge toast or result card, and always on a
surprise, so the evidence exists. A minimal LZW writer in the bundle, no library. *Why
both:* the GIF cannot drift and the tab cannot lie about inputs; a surprise needs a
claim and its evidence. **Demos first:** every candidate badge and line is a scripted
run in node that yields a tab and a demo page and says whether it closes; the author
picks the badges from the demos, and lines that do not close go to the surprise table.

## Risks / Trade-offs

- [The honest physics is too hard to play: release windows are about 0.1 s, the lifted
  gait diverges in 0.6 s] → slow-motion and balance assists, a ghost to imitate, levels
  that need only one technique at a time, and the tutorial's scripted failure to set
  expectations.
- [Parity drifts between Python and JavaScript] → same integrator and step for the test,
  constants exported from the same YAML and checksum-stamped, test part of the game
  repository's `make check`, tolerance stated.
- [Recording controls in `roping_sim.py` changes the published tracks] → record without
  touching the integration path, and compare track checksums before and after, as in the
  two earlier refactors.
- [The wing-in-flight simplification (decision 6) makes gliding too easy or wrong] →
  constants in YAML, flagged on the page's notes, and a level that shows the 2.5 glide
  ratio for what it is; revisit in a follow-up change.
- [Keyboard ramps hide the difference between a 2 g and a 3 g brake] → the HUD shows the
  tip deceleration in g and the grip used, and Shift gives the hard brake.
- [Single-file build grows] → budget 1 MB; ghosts are 50 Hz and rounded, as the tracks
  already are.
- [A replayed tab drifts on another browser or build] → checkpoints per token, the
  drift reported with time and distance, the GIF as the record that cannot drift, the
  build id and checksum in the header so an old tab is named as old.
- [Tokens can be farmed by mashing keys] → a token counts only if it did work (decision
  15); lines are shapes, so a longer line is the same line.
- [Badges inflate into a ladder] → decision 14: nothing is rewarded for being bigger;
  every candidate is a demo before it is a badge, and the author picks.
- [A frame hitch on a slow machine earns "you made the game stutter"] → 250 ms
  threshold, once per browser, and it says it may be the machine.

## Migration Plan

Nothing to migrate. The change adds the repository `repos/ari-roping/`, and in
`radio_ocean` one export script and one Makefile target. Rollback is deleting the repository and the target; the recorded control trace in
`roping_sim.py` is inert if unused.

## Open Questions

- Should a brutal, assist-free mode be the default, in the spirit of the character, with
  assists as the opt-in? The design defaults to balance assist on, everything else off.
- Levels versus an endless route 30 with stops, supports, traffic and weather: the
  design does levels first and leaves the endless route for a follow-up.
- A better model for the spread body in flight (decision 6).
- Whether the grip limit should depend on tip speed (an eddy-current brake weakens at low
  speed), which would change how the drop and the catch feel.
