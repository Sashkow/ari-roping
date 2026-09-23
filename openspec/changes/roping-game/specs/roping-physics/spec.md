## ADDED Requirements

### Requirement: Attached dynamics match the simulations
While her pole tips are on the wire, the game SHALL integrate the same equations as `roping_sim.Sim.step`: a point mass on rigid massless poles pinned at the tips, with weight, wing lift and drag, flare drag, narrow-body drag, cross-flow drag along the poles, the tips' acceleration along the wire and the rate of change of pole length. Physical constants SHALL come from `data/constants.json`, exported from the simulations' YAML and stamped with its checksum, and from the game's level files, never written into the JavaScript. The game repository SHALL build and pass its tests without access to `radio_ocean`.

#### Scenario: Replay of a solved run
- **WHEN** the control trace exported from a solved Python run is fed to the JavaScript physics at the Python time step
- **THEN** her head position stays within 5 cm and her pole angle within 1° of the Python trajectory throughout the attached phases up to the release

#### Scenario: Stale constants are refused
- **WHEN** the simulations' `baseline.yaml` has changed since `data/constants.json` was exported and the parity test is run with `radio_ocean` present
- **THEN** the test fails and names the export command to run

#### Scenario: Constants come from configuration
- **WHEN** a constant such as her mass or the pole diameter is changed in the simulations' YAML, exported again, and the game is rebuilt
- **THEN** the game's behaviour changes accordingly without any edit to the JavaScript sources

### Requirement: Body form and pitch produce lift and drag
The game SHALL model three body states: narrow (small drag, no lift), spread at low pitch (the wing: lift and drag from the slender-wing model of `roping_gaits.Gaits.wing` at that angle of attack), and spread at full pitch (the flare: drag from the simulations' flare constant), with a continuous blend between wing and flare as pitch rises.

#### Scenario: Flare at speed
- **WHEN** she is spread at full pitch at 22 m/s on the wire
- **THEN** the drag on her body is about 2.2 to 2.5 times her weight, as in the solved drop

#### Scenario: Lifted gait is reachable
- **WHEN** she is ahead of her tips at 65° and 22 m/s with the wing at about 24.5° of pitch
- **THEN** her lift is about 140 % of her weight, the poles are in compression and the tips press up on the wire

### Requirement: The tips are a mass on the wire driven by force
The tips SHALL be modelled as the poles' mass riding the wire, accelerated along it by the sum of the applied drive force, the shoe friction and the pole's pull, with the same equation as the simulations. The player's throttle SHALL be a wished tip acceleration that is resolved to the force that would give it, and that force SHALL be clamped to the coil thrust forward and to the coil thrust plus the grip limit backward, the coil thrust fading in proportion to tip speed below the configured fade speed. Shoe friction SHALL equal the configured coefficient times the previous step's pole force, directed against the tips' motion. A configured hang-load limit SHALL make her lose the wire when exceeded. Tip parameters SHALL come from the exported constants, and a level MAY override them.

#### Scenario: Brake beyond the caps
- **WHEN** the player commands a tip brake that would need more backward force than the coils and the jaws can give
- **THEN** the tips decelerate only as fast as the caps allow and the HUD shows that the tips slip and by how much

#### Scenario: Forward force is the coils only
- **WHEN** the player asks for forward acceleration beyond the coil thrust
- **THEN** the tips receive the coil thrust and no more

#### Scenario: Friction under load
- **WHEN** the pole force rises while the tips move along the wire
- **THEN** the shoe force on the tips rises with it, against their motion, whether or not anything is commanded

#### Scenario: Overloaded hang
- **WHEN** the load of her poles on the wire exceeds the hang-load limit
- **THEN** her tips come off the wire and the flight state begins

### Requirement: Flight is a spinning rigid body whose spin follows pole length
Off the wire the game SHALL integrate her position, velocity, attitude and spin, with gravity, body drag, pole drag, and, when she is spread, lift. Her spin at release SHALL equal the swing rate of the poles, and angular momentum SHALL be conserved as pole length changes, so that shorter poles spin her faster and longer poles slower.

#### Scenario: Pulling the poles in speeds the spin
- **WHEN** she is released spinning at 1.5 turns per second with 1.0 m poles and the player lets the poles out to 2.4 m
- **THEN** her spin falls by the ratio of the two moments of inertia, to about a third

#### Scenario: Spread body in flight
- **WHEN** she is spread in the air above flying speed with the wing pitched
- **THEN** she produces lift and drag from the same wing model, her spin decays with the configured time constant, and her glide is no better than the model's lift-to-drag ratio of about 2.5

### Requirement: Fully pulled in, she curls into a hoop that spins faster and has to open before anything else
In the air and narrow, with her poles at their shortest, holding the pull-in control for a configured moment SHALL curl her into a hoop over a configured time. Curled, her moment of inertia SHALL be the simulations' ring value, blending from the in-line value as she closes, with angular momentum conserved, and her poles SHALL add no drag. While she is curled at all, letting the poles out, reaching for the wire and spreading SHALL first uncurl her over the same time, and only then take effect. With her poles longer than their shortest she SHALL stay straight. No control beyond the pole-length control SHALL be needed.

#### Scenario: The hoop spins faster
- **WHEN** she is spinning in the air with her poles fully in and the pull-in control is held for the configured moment
- **THEN** she curls, and once closed she spins about 2.3 times faster than she did straight at that pole length

#### Scenario: Reaching from the hoop
- **WHEN** grip is pressed while she is curled
- **THEN** she first opens, her spin falling back as she straightens, and only then do her poles start toward the wire

#### Scenario: She picks the instant to open
- **WHEN** grip goes down while she is spinning in the hoop and automatic opening is on
- **THEN** she stays curled until the instant, within her next turn, from which opening and reaching catches the wire with her tips landing ahead of her, and opens then; if no instant catches she opens at once, and a second press of grip cancels it

#### Scenario: Staying straight
- **WHEN** her poles are held a little longer than their shortest
- **THEN** she does not curl, and her poles reach the moment grip is held

### Requirement: She catches the wire by reaching for it
After grip is pressed once in the air (a single press, not a hold) she SHALL go for the wire until she has it: her poles SHALL run toward the wire along the direction they point, lengthening or shortening at a configured reach speed, to the length at which a tip meets the wire, or to full length if the wire is out of range or the poles point away from it. She SHALL be attached at the step in which a tip crosses the plane of the wires. On contact the tips SHALL start at her horizontal speed, the swing rate SHALL come from her velocity across the poles, and the speed along the poles, including the reach, SHALL be absorbed up to a configured limit, beyond which the catch counts as a hard catch against her body-load limit. Pressing grip again before contact SHALL call the reach off and leave the poles at their current length. While she is reaching, the pole-length and spread controls SHALL have no effect. Pole length SHALL keep setting her spin during the reach.

#### Scenario: Reach and catch
- **WHEN** grip is pressed once while her poles point down toward the wire and the wire is within their full length
- **THEN** the poles run to the wire at the reach speed and she is attached with no jump in her head position, the tips running at her horizontal speed

#### Scenario: Sweep catch
- **WHEN** grip is pressed once while the poles point away from the wire
- **THEN** they run to full length, her spin slows by the ratio of the moments of inertia, and she is attached when her roll brings a tip across the wire plane

#### Scenario: Cancelled reach
- **WHEN** grip is pressed a second time before any tip meets the wire
- **THEN** nothing attaches, the poles keep the length they reached, and the flight continues
