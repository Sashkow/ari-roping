# roping-tip-dynamics

How the pole tips ride the wire in the roping simulations (`radio_ocean/notes/scenes/ari-roping/roping_sim.py`) and, ported, in the game (`src/physics.js`). Synced from the archived change `2026-09-24-roping-tip-dynamics` on 2026-09-24.

## Requirements

### Requirement: The tips are a mass on the wire driven by force
The roping simulation SHALL model Ari's pole tips as a particle of the poles' mass
riding the wire, whose acceleration along the wire is computed each step from the sum
of the drive force, the shoe friction and the pole's pull along the wire. Tip
acceleration SHALL NOT be a commanded input.

#### Scenario: Acceleration emerges from the forces
- **WHEN** a controller asks for a drive force while the body pulls on the poles at an angle
- **THEN** the tips accelerate by (drive + shoe friction + pole pull along the wire) divided by the tip mass plus the body's projected mass, and the recorded row holds both the force asked for and the force applied

#### Scenario: The bottom of the swing is regular
- **WHEN** the poles pass vertical while a drive force is applied
- **THEN** the step completes with a finite tip acceleration (no guard, no clamp for the singular angle)

### Requirement: The drive force is bounded by the coils forward and by coils plus jaws backward
The simulation SHALL clamp the controller's drive force to the coil thrust in the direction the tips are moving and to the coil thrust plus the grip limit against it (the jaws are friction and only oppose the tips' motion, whichever way along the wire that is),
with coil thrust reduced in proportion to tip speed below a configured fade speed.

#### Scenario: A brake beyond the caps slips
- **WHEN** a phase asks for more backward force than coils plus jaws can give
- **THEN** the tips receive exactly the cap, the row records the asked and applied forces, and the run continues

#### Scenario: Forward force is coils only
- **WHEN** a phase asks for forward force above the coil thrust
- **THEN** the applied force is the coil thrust

#### Scenario: Coils fade near standstill
- **WHEN** the tip speed is below the configured fade speed
- **THEN** the available coil thrust is scaled by tip speed over fade speed, and the jaws are unaffected

### Requirement: Shoe friction opposes the tips in proportion to pole load
The simulation SHALL apply a friction force on the tips equal to the configured
coefficient times the magnitude of the previous step's pole force, directed against the
tips' motion along the wire, in every attached phase.

#### Scenario: Friction under a launch load
- **WHEN** the poles are pulled in through the bottom of the swing and the pole force rises
- **THEN** the friction force rises with it and the tips lose speed that the drive did not command

#### Scenario: Friction in the two gaits
- **WHEN** the run reports cruise in the pulled gait and in the lifted gait
- **THEN** the shoe drag reported for the lifted gait is smaller, in the ratio of the pole loads

#### Scenario: Zero coefficient reproduces the kinematic model
- **WHEN** the coefficient is zero and the caps are set far above any force the run needs
- **THEN** the solved runs match the previous kinematic export within the parity tolerance

### Requirement: Tip parameters are run configuration
The simulation SHALL read every tip parameter (tip mass source, coil thrust, coil fade speed, grip limit, shoe coefficient, hang limit) from the run's config with a documented source, and the export SHALL write them into the game's constants and into each parity segment.

#### Scenario: A scenario overrides one parameter
- **WHEN** a scenario config sets a different shoe coefficient
- **THEN** that run uses it and its export carries it, while the baseline is unchanged

#### Scenario: The export refuses a half-set
- **WHEN** any of the four runs fails to close under the current parameters
- **THEN** the export writes nothing and names the run and the phase that failed

### Requirement: Hang limit is reported, not simulated
The simulation SHALL compare the peak pole force of each run with the configured hang
limit and report the margin; it SHALL NOT release the tips.

#### Scenario: A run exceeds the hang limit
- **WHEN** a phase's pole force passes the hang limit
- **THEN** the run's summary states the peak, the limit and the phase, and the run still closes

### Requirement: The treatment's numbers come from the solved model
The figures quoted in the roping treatment and in the canon note SHALL be those printed
by the numbers script from the current solve, and the treatment SHALL state which model
produced them and when.

#### Scenario: Numbers script output
- **WHEN** the numbers script is run after a solve
- **THEN** it prints the beat-table figures and, in addition, the shoe drag at cruise in each gait, the speed lost across a launch, the peak jaw force, and the coil energy recovered in the brake
