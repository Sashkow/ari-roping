## ADDED Requirements

### Requirement: Levels are data
Each level SHALL be a YAML file that can extend another: bus speed, number and spacing of buses, wind, her starting gait and speed, allowed assists, and par values. The build SHALL resolve the inheritance and embed the result in the page.

#### Scenario: A level overrides one value
- **WHEN** a level file extends the base level and sets only the bus speed
- **THEN** the built game uses that bus speed and every other value of the base level

### Requirement: Bus speed sets the technique the player needs
The level ladder SHALL be ordered by bus speed so that the limits found by the simulations become the difficulty: buses slow enough for a tip brake alone, then buses that need the pull of the poles, then buses that need the flare kick, then levels with wind and a level that starts in the lifted gait.

#### Scenario: Brake only stops working
- **WHEN** the bus moves faster than about 14 km/h and the player uses a tip brake with full-length poles
- **THEN** she cannot land ahead of the windscreen, whatever the brake

#### Scenario: Headwind makes the lifted gait available at town speed
- **WHEN** a level has an 8 m/s headwind
- **THEN** the lifted gait can be held from about 36 km/h over the ground

### Requirement: Fail states are the physics' own
A run SHALL end in failure when her body or poles touch the bus body, the bus's poles or the road; when her attached tips reach the bus's collector shoes; when her body or poles enter a span-wire zone at a support; when the load on her body exceeds the configured limit; or when she comes to rest off the wire. Each failure SHALL be named on screen.

#### Scenario: Landing short
- **WHEN** she catches the wires above the bus and swings down onto its roof
- **THEN** the run ends and the screen names the cause as the bus roof

### Requirement: Touching both wires strikes an arc, it does not end the run
When her body crosses the plane of the two wires while she is spread, the game SHALL strike an electric arc between her and the wire that burns for a configured time (3 s by default). The run SHALL continue. For as long as the arc burns her body SHALL be narrow whatever the player commands, so that she can neither flare nor fly, and her wing SHALL be switched off, to be switched on again by the player afterwards. The arc SHALL be drawn between her and the wire and the readout SHALL show the time it has left.

#### Scenario: Spread between the wires
- **WHEN** her body crosses the plane of the two wires, 520 mm apart, while she is spread
- **THEN** an arc strikes between her and the wire, the run goes on, and for 3 s a flare or wing command has no effect

#### Scenario: After the arc
- **WHEN** the arc has burnt out and the player spreads her again
- **THEN** her body spreads and makes lift and drag as before

#### Scenario: Narrow between the wires
- **WHEN** she crosses the plane of the wires narrow
- **THEN** nothing happens

### Requirement: A scripted first attempt opens the game
The first level SHALL begin with a scripted attempt that brakes the tips at about 2 g, makes a clean half turn and lands short on the bus roof, after which control passes to the player. The page SHALL expose a hook for an audio cue on the flight of that attempt and SHALL ship without audio.

#### Scenario: The tutorial fails on purpose
- **WHEN** the first level starts
- **THEN** the scripted attempt plays to its landing on the roof, the cause is named, and the player is given the same start

### Requirement: Scoring rewards what the simulations measured
For each bus passed the game SHALL score the speed kept, the effort spent (work along the poles plus energy through the tips), the margin ahead of the windscreen and the turns made, and SHALL mark runs made without assists. Scores SHALL be kept in the browser only, and the game SHALL work when storage is unavailable.

#### Scenario: Storage blocked
- **WHEN** the browser refuses access to local storage
- **THEN** the game plays normally and shows scores for the session only

### Requirement: Acknowledgements are numbers, badges are shapes
The game SHALL acknowledge every detected event with a toast and a line on the result card that names the event and its numbers, without pausing the run. A badge SHALL be given once per browser for the first occurrence of a kind of event, named for its content, listed on the pause and result cards, with a sparkle from her pole tips; a later occurrence of the same kind SHALL be acknowledged with a note that the badge is already held. Nothing SHALL be rewarded for a larger value of the same kind. Badges SHALL be kept in the browser only; when storage is refused the game SHALL play normally and keep them for the session. A badge earned with an assist on SHALL be marked so. The run SHALL auto-pause only for a surprise or a crash.

#### Scenario: A higher hop
- **WHEN** the player who holds "Hop!" clears a bus 0.9 m higher than before
- **THEN** a toast gives the apex and says the badge is already held, and no new badge is given

#### Scenario: Storage refused
- **WHEN** the browser refuses local storage
- **THEN** badges earned in this session are shown for the session and the game plays normally

### Requirement: The badge list shows what is left
The pause and result cards SHALL list badges in three classes: earned, with its recipe; not yet earned, with its recipe; hidden, shown as "??" with only its category. The list SHALL end with a count of badges not yet earned and, for surprises, the number of beliefs still unbroken, stated as "at least" because the table grows.

#### Scenario: A hidden badge
- **WHEN** the player opens the pause card before curling in the air
- **THEN** the hoop badge appears as "?? (something about the hoop)" and counts toward the number left

### Requirement: Controller badges
The game SHALL give badges for the radio or gamepad: "Calibrated" when every function that the game uses has been assigned on the mapping card and each assigned axis has been seen near both of its ends; "Full stick" when during a run the lift stick travels from narrow through wing to flare in one motion; "Two hands" when the speed and lift controls both move within the same half-second while she is in the air; "Hands off" when the lifted gait is held for 10 s from the pad with the balance assist off. Flipping an axis SHALL be acknowledged only.

#### Scenario: Calibrated
- **WHEN** speed, pole, lift and grip are assigned and the three axes have each been moved past 0.95 both ways
- **THEN** "Calibrated" is given, and axes the game does not use are ignored

### Requirement: Lines
The game SHALL derive a stream of tokens from the run's transitions (REL, CATCH.reach, CATCH.sweep, CATCH.hard, SPREAD, NARROW, FLARE, CURL, OPEN, PULL, REACH, APEX, TURN, ARC, LIFTED.enter, LIFTED.hold, PASS), counting a token only when it did work (the wing made lift before the next token, the spin rose, the poles moved more than a configured length). Lines SHALL be declared in the level data as an ordered token list with a window after each token and forbidden tokens between; windows SHALL be events (zero-crossings of the pole angle on the wire, the current flight or a number of turns in the air) with an optional cap in seconds. The HUD SHALL show the current token string with its numbers as an acknowledgement. A named line completed SHALL give its badge; an unnamed line of five or more distinct tokens SHALL be acknowledged and its tab kept. Names SHALL come from the level data only.

#### Scenario: Lifted before the swing back
- **WHEN** a line requires LIFTED.enter within the window "before the pole angle passes back through zero" after CATCH and she enters the lifted gait on the forward swing after the catch
- **THEN** the line is matched, whatever the pole length

#### Scenario: Mashing the wing key
- **WHEN** the player toggles the wing four times in the air with no lift made
- **THEN** no SPREAD or NARROW token is added

### Requirement: Surprise the devs is unbounded and deduplicated
Each belief in the surprise table SHALL be earned once per browser; a later crossing of the same belief SHALL be acknowledged with the earlier and the new values, and the best value kept in the record. Badge titles SHALL be generated from the belief's content. Unbroken beliefs SHALL be listed as "??" with a category. A JavaScript error during a run SHALL earn "You crashed the game" and copy the tab automatically; a frame longer than 250 ms during a run SHALL earn "You made the game stutter" once and say it may be the machine; a physics quantity leaving its range SHALL earn as before. A surprise or a crash SHALL pause the run and show its card, and SHALL produce the GIF.

#### Scenario: Second time past the same belief
- **WHEN** the player who broke "no flare kick above 47 km/h" at 52 km/h passes at 55 km/h
- **THEN** the toast says the belief was already broken at 52 and now at 55, and no badge is added

### Requirement: The tab
Every run SHALL be recorded as text: a header with build id, constants checksum, level, bus speed, wind and input device; one line per input change, quantised to 1/100 and at most one per 10 ms per control; a `#` line per token with its time, its numbers and its event window; a checkpoint at each token and at the end with time, position and a hash of the state. Replaying the tab through the command layer at the fixed step SHALL reproduce the run on the build that made it. The Copy button of the surprise card and of any badge toast SHALL copy the tab.

#### Scenario: A hand-edited tab
- **WHEN** the grip line of a tab is moved 40 ms earlier and the tab is pasted back
- **THEN** the game replays the edited run and reports its tokens

### Requirement: Replay and demo from a tab
`#tab=` in the page's hash, a paste box, or a dropped tab, GIF or PNG carrying one SHALL replay the run with the tab as the autopilot, show the numbered key moments from its `#` lines with a card of numbers per moment, stop at moments on request, and hold a still with `#shot=N`. When the replay leaves a checkpoint by more than a configured distance the page SHALL keep playing and show a warning naming the time and the distance.

#### Scenario: Replay on another browser drifts
- **WHEN** a tab recorded in one browser is replayed in another and the state differs at the third checkpoint
- **THEN** the replay continues and a warning names the checkpoint's time and the distance

### Requirement: The GIF carries the tab
On request from a badge toast or result card, and always on a surprise, the page SHALL render a GIF from the replay (not from live frames) with the key-moment numbers stamped at her head and kept in place, the token string as a caption, and the tab in the GIF's comment block; the still of the last frame SHALL be a PNG with the tab in a text chunk. Dropping either on the page SHALL replay it.

#### Scenario: The GIF is the save file
- **WHEN** a GIF made by the page is dropped on the page
- **THEN** the run replays from the tab in its comment block

### Requirement: Ghost replays of the solved runs
The game SHALL be able to show, on levels that have one, a translucent replay of a solved Python run from its exported trajectory, as a technique to imitate.

#### Scenario: Ghost on the pull level
- **WHEN** the player enables the ghost on the first level that needs the pull
- **THEN** a translucent Ari performs the solved brake-and-pull run from the same start, in time with the level's bus
