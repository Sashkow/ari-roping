## ADDED Requirements

### Requirement: Five player controls
The game SHALL give the player exactly these controls: tip throttle (accelerate or brake the tips along the wire), pole length (shorter or longer), grip (release when attached, attempt a catch when in the air), body spread or narrow, and body pitch. Every move of the solved simulations SHALL be performable with them and without any scripted help.

#### Scenario: Brake and pull by hand
- **WHEN** a player at 22 m/s in the pulled gait brakes the tips at about 0.7 g, pulls the poles in through the bottom of the swing and releases near 60°
- **THEN** she leaves the wire at about 20 m/s forward and clears a 12 m bus moving at 3 m/s, as in the solved run

#### Scenario: Flare kick and pull by hand
- **WHEN** a player spreads at full pitch for about a quarter of a second while holding tip speed, goes narrow, pulls the poles in on the forward swing and releases near 60°
- **THEN** she leaves the wire faster than her cruise speed

### Requirement: Keyboard input drives analog commands through ramps
On a keyboard each digital key SHALL drive an analog command through a configured ramp: throttle from zero to full over a configured time, a modifier key for the hard rate, pitch at a configured rate in degrees per second, and pole length at a configured speed in metres per second. The mapping layer SHALL be independent of the device so that a gamepad can drive the same commands.

#### Scenario: Gentle and hard brake
- **WHEN** the player taps the brake key briefly, and then holds it with the modifier
- **THEN** the first produces a tip deceleration well under 1 g and the second reaches the grip limit, and the HUD shows both values in g

#### Scenario: Gamepad uses the same commands
- **WHEN** a gamepad axis is mapped to the throttle
- **THEN** the physics receives the same command type as from the keyboard, with the axis value in place of the ramp

### Requirement: Assists are optional and per level
The game SHALL offer three assists as toggles: lifted-gait balance (the simulations' rule on angle of attack), sway damping (the tips follow her swing), and slow motion. Each level SHALL declare which assists are allowed, and a run SHALL record which were used.

#### Scenario: Balance assist holds the lifted gait
- **WHEN** balance assist is on and she is in the lifted gait at cruise speed with no pitch input
- **THEN** her pole angle stays within 2° of the lead angle

#### Scenario: No assist, no balance
- **WHEN** balance assist is off and the player gives no pitch input in the lifted gait
- **THEN** her pole angle diverges from the lead angle within a few seconds and she drops out of the gait
