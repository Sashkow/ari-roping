## ADDED Requirements

### Requirement: One self-contained page
The build SHALL produce a single HTML file that contains the game's scripts, levels, constants and ghost data, makes no network requests except optional fonts, follows the artifact page contract (title, theme tokens, 16 px gutter, phone width without horizontal scroll), and stays under 1 MB.

#### Scenario: Offline play
- **WHEN** the built page is opened from disk with no network
- **THEN** the game loads and plays

### Requirement: Side view, to scale, with a camera that follows her
The page SHALL draw the two wires, supports, road, trolleybuses with their poles on the wires, and Ari with her poles, body form, pitch, flare and bowed poles in compression, to scale, with a camera that follows her, looks ahead in proportion to her speed and widens in flight.

#### Scenario: The hoop is drawn
- **WHEN** she curls into the hoop
- **THEN** her body and poles bend into a closed ring, head, poles, tips and tail, that rolls with her spin, and open again when she uncurls

#### Scenario: Flight stays in frame
- **WHEN** she is released and rises 4 m above the wires at 20 m/s
- **THEN** she, the wires and the bus below her remain visible

### Requirement: The HUD shows what the player controls and what limits them
The page SHALL show tip speed, tip acceleration in g, grip used against the limit, pole length, body state and pitch, lift as a share of her weight, the load on her body in g, her height, and the distance to the bus, and SHALL show the key bindings and active assists.

#### Scenario: Reading a brake
- **WHEN** the player brakes the tips
- **THEN** the HUD shows the deceleration in g and how much of the grip limit it uses

### Requirement: Playable at 60 frames per second
The game SHALL integrate the physics at a fixed step independent of the frame rate and SHALL hold 60 frames per second on the development machine in chromium.

#### Scenario: Frame rate does not change the physics
- **WHEN** the same recorded inputs are replayed at 30 and at 60 frames per second
- **THEN** the resulting trajectories are identical

### Requirement: Publication is recorded
When the page is published as an artifact, a row SHALL be added to `notes/demos.md` with what it shows and what it is built from, and `notes/scenes/ari-roping/ari-roping.md` SHALL point to the game.

#### Scenario: After publishing
- **WHEN** the game page is published
- **THEN** `notes/demos.md` in `radio_ocean` has a row for it naming the repository `repos/ari-roping/` and its build command
