## 1. Baseline before touching anything

- [x] 1.1 (2026-09-23: `superseded/kinematic-2026-09-23/` holds the outputs of all five scripts and `solved-params.json`; the exact trajectories are the game's `data/parity/*.json` at tag `kinematic-baseline-2026-09-23`) Record today's numbers: run `roping_numbers.py`, `roping_pulled.py` for each pulled config, `roping_two_gaits.py`; keep their output and `solved-params.json` under `notes/scenes/ari-roping/superseded/kinematic-2026-09-23/` as the reference the migration compares against
- [x] 1.2 (2026-09-23) The whole game repo committed and pushed as its first commit, tagged `kinematic-baseline-2026-09-23`, at <https://github.com/Sashkow/ari-roping>; `data/` is in it, so rollback is `git checkout kinematic-baseline-2026-09-23 -- data`

## 2. Config

- [x] 2.1 `configs/baseline.yaml`: add the `tips:` block (design decision 5) with sources in comments: `mass_from: body.poles_mass`, `coil: {thrust: 10, fade_speed: 3.0}` (design 3a), `grip: 450`, `shoe_mu: 0.2`, `hang_limit: 1000`
- [x] 2.2 `roping_config.py`: load and validate the block; a scenario may override any key; `mass_from` resolves to a number
- [x] 2.3 (as overlays: `--tips configs/<name>.yaml` lays that file's `tips:` over any run's config, so one file serves every run) Scenarios `configs/slime.yaml` (`shoe_mu: 0.05`, the magnetite-and-slime tip of `notes/ari.md`, Open) and `configs/dry.yaml` (`shoe_mu: 0.55`, the same tip with no slime); each extends the baseline and changes nothing else
- [x] 2.4 A scenario `configs/kinematic.yaml` with `shoe_mu: 0`, `coil.thrust: 1e9`, `grip: 1e9`, `fade_speed: 0`: the old model expressed in the new one, for the migration check

## 3. The tip equation (`roping_sim.py`)

- [x] 3.1 `Sim.step` takes `f_cmd` instead of `a_p`; computes `T₀` at zero tip acceleration, the coil cap with fade, the asymmetric clamp of decision 2, `f_shoe = −μ·|T_prev|·sign(u)` with `sign` smoothed over ±0.05 m/s, then `a_p = (f_applied + f_shoe + T₀·sin θ) / (m_t + M·sin²θ)`; returns `a_p` and the applied forces in `out`
- [x] 3.2 `Sim.run`: `ctrl` returns `(f_cmd, mode, level)`; rows record `f_cmd`, `f_applied`, `f_shoe`, `f_coil`, `f_jaw`, `a_p`, and `T_prev` is carried across steps and phases
- [x] 3.3 (as `hold_speed(target, gain, u)` returning a force, plus `Accel(a)`: a rule's wish for an acceleration, resolved to the force that would give it inside `step` and then clamped; the scripts' brake parameters stay in m/s² and mean what they meant) `hold_speed(target, gain)` helper for controllers, with the gain in `move:` of the config (`tip_hold_gain`, N per m/s)
- [x] 3.4 Per-run summary: peak pole force against `hang_limit` (reported, never released), peak jaw force, total shoe work, coil energy recovered (∫ f_coil·u dt where it is negative)
- [x] 3.5 A unit test in `tests/test_roping_sim.py`: with the kinematic scenario, one second of the baseline brake reproduces the old `a_p` trajectory to 1e-6; with friction on, the bottom-of-swing step is finite and the shoe force has the right sign

## 4. Controllers and solves

- [x] 4.1 `roping_pulled.py`: each phase's `a_p` script becomes an `f_cmd` script through `hold_speed`; the brake scan and the flare scan record "slipped: asked X N, got Y N" when the clamp acted; `solved-params.json` keeps the best closing launch
- [x] 4.2 `roping_two_gaits.py`: the same for the drop brake, the drive, the circle brake and the overshoot; bisection targets unchanged
- [x] 4.3 (2026-09-23: exported trajectories match the game's parity files to 1e-12 on every reference sample; printed outputs identical) Migration check (design, Migration 1): run both scripts with `--config configs/kinematic.yaml` and compare with the 1.1 reference to the parity tolerance (2.3 cm, 0.6°); fix until they match
- [x] 4.4 (2026-09-23, after the coils were resized to 35 N and the poles to 3 kg, design 3a; the post-catch phases rewritten: anti-pump run-out, and for two-gaits the giant circle dropped, see design 9) Real parameters: run all four scenarios; confirm every one closes; note in each scenario's summary which phases slipped and by how much
- [x] 4.4a (2026-09-23: same launch in all three; shoe work 678 / 2841 J slimed / graphite; dry does not close: 21 N of the 35 N of coil go to the shoe at cruise and the run-out loops) Run the baseline move under `slime.yaml` and `dry.yaml`: does it close, what does each launch cost, can the coils hold cruise; a three-row table (0.05 / 0.2 / 0.55) for 5.1 and for the Open entry in `notes/ari.md`
- [x] 4.5 (2026-09-23, found in the solving: the pump cannot start a swing from a dead hang, so recovery is the *anti*-pump (poles short near the top of each swing, long through the bottom) with coil thrust only in phase with the swing, 10-15 s to cruise; the lead is entered by the old overshoot-and-ease recipe, which needs only braking force, at 9.6 m/s of overshoot) The pump: a `pump(stroke, period)` controller phase (pull the poles in through the bottom, let out on the way up) and a solve for the number of pumps that returns her from the post-catch speed to cruise in each scenario; its figures go to 5.1
- [x] 4.6 (the overshoot reach is not monotone above ~10 m/s; bracketed at 2-10 in `two-gaits.yaml`; the release-angle scans are grids, not bisections) Check the release-angle search is still monotone on the baseline (design, last risk); if not, bracket it

## 5. Numbers and text

- [x] 5.1 (the run scripts save `solved-tips.json`; `roping_numbers.py` prints cruise cost per gait and each run's tip figures) `roping_numbers.py`: print the beat-table figures from the new solve plus shoe drag at cruise in each gait, speed lost across a launch, peak jaw force, coil energy recovered
- [x] 5.2 (sections 7 and 8 updated, new section 11; sections 4 and 6 marked as the kinematic sketch and kept) `notes/scenes/ari-roping/ari-roping.md`: update the beat table and the assumptions paragraph (infinite grip and frictionless tips are no longer assumed); a line under the table naming the model and the date; the Frames section notes any frame whose caption now disagrees with its drawing
- [x] 5.3 `notes/ari.md` "Her tips slide": replace the rough figures (9 N, 3 N, 170 N, a tenth of her speed) with the solved ones, marked derived
- [x] 5.4 (decided: no. `roping_gaits.py` is a static balance of body forces; the shoe acts on the tips, not the body, and enters the gait pages only as the drive figure, which `roping_numbers.py` now prints) `roping_gaits.py` / `gaits.html`: decide whether shoe drag enters the static gait balance (design, open question 3); if yes, regenerate the page and update its row in `notes/demos.md`
- [x] 5.5 (section 11 names the change and the game follow-up) `notes/scenes/ari-roping/ari-roping.md` section on the game: point to the follow-up tasks in `repos/ari-roping`

## 6. Export

- [x] 6.1 `roping_export.py`: `tips` block into `constants.json`; parity segments carry `f_applied` as the control plus the tip parameters; refuse to write if any run failed to close (spec: the export refuses a half-set)
- [x] 6.2 (constants sha 68b61012 -> 25662f3c; four parity and four ghost files rewritten) `make export-roping`; confirm `data/constants.json` hash changed and the four parity and ghost files are rewritten
- [x] 6.3 (2026-09-23: `make check` in ari-roping fails as intended: parity head position off by 0.71 m (pulled-gait), 0.40 (pull), 0.42 (kick), 0.97 m (two-gaits); the hoop-spin test expects 2.3x and gets 3.22x with 3 kg poles; the demo replay's tokens moved. 44 tests: 38 pass, 6 fail. `data/` is left modified and uncommitted in ari-roping until the port lands) Run `make check` in `repos/ari-roping` and confirm it fails on parity for the expected reason (the port is not in yet); record the failing tolerance numbers for the follow-up

## 7. Follow-up in `repos/ari-roping` (done 2026-09-23 as section 14 of `openspec/changes/roping-game/tasks.md`; ticked here from there)

- [x] 7.1 `physics.js`: port the tip equation (`limitTipAccel` becomes the tip step); `game.js`: `←` commands braking force (coils 10 N plus jaws to 450), `→` is the pump (an automatic pole stroke through the bottom of each swing while held; coils hold cruise); friction term with the same one-step lag
- [x] 7.2 `levels/base.yaml`: `tips` from `constants.json`; `grip_limit` 450; `hang_limit` stays the game's forced release
- [x] 7.3 Parity green at μ 0.2; `data/parity` tolerance unchanged
- [x] 7.4 Readout rows: shoe friction, jaw force, coil power; result card's "Speed kept" now meaningful
- [x] 7.5 `tools/demo.mjs` rerun; belief rows in 9.10 updated with the new limits (63 km/h pass, One breath, the hard brake + pull as a slip)
- [x] 7.6 `design.md` decision 3 rewritten as coils / shoe / jaws with the numbers; `specs/roping-physics/spec.md` requirement for tip friction and the asymmetric caps
- [x] 7.7 Rebuild, republish the artifact and the site, row in `notes/demos.md`
