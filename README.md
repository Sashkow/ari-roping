# Roping Ari

A browser game built from the Roping Ari simulations: the player flies Ari along the two
wires of a Kyiv trolleybus line and has to get past trolleybuses. Side view, to scale,
honest physics.

The plan, design and task list are the OpenSpec change `openspec/changes/roping-game/`.

    make check      # node tests, including parity with the Python simulations
    make build      # dist/roping-ari.html, one self-contained page
    make export     # refresh data/ from ../radio_ocean (runs the simulations, minutes)
    make site       # assemble the public site in ../ari-roping-site (built pages only)

Public site: https://sashkow.github.io/roping-ari/ (repository Sashkow/roping-ari, pushed from
`../ari-roping-site`; after `make site`, commit and push there).

## Layout

    src/        ES modules: aero, physics, world, input, levels, render, hud, main
    levels/     YAML levels; base.yaml sits on top of data/constants.json
    data/       exported from ../radio_ocean/notes/scenes/ari-roping (committed):
                constants.json   physics constants resolved from configs/baseline.yaml,
                                 stamped with that file's checksum
                parity/*.json    control inputs and reference trajectories of the solved runs
                ghosts/*.json    50 Hz tracks of the solved runs, for ghost replays
    tests/      node:test suites
    build.py    bundles src/, levels/ and ghosts into dist/roping-ari.html

The physics in `src/physics.js` and `src/aero.js` is a port of `roping_sim.py` and
`roping_gaits.py`. `tests/parity.test.mjs` replays the Python control inputs through it
and fails if the trajectories differ by more than 5 cm or 1°, or if `constants.json` is
older than the simulations' `baseline.yaml`.

## Radio or gamepad (RadioMaster TX12)

The game polls the browser's Gamepad API. A TX12 on USB in EdgeTX's "USB Joystick" mode is a plain HID joystick.
Open `dist/roping-ari.html` from disk or the public site; inside a claude.ai artifact the browser may not hand
gamepads to the embedded page. Default mapping (EdgeTX channel order AETR, sticks in mode 2), all changeable on the
page's "Radio or gamepad" card and saved in the browser:

    right stick left-right     brake / speed up her pole tips, by how far it is pushed (full stick 2 g)
    right stick up-down        pole length: up pulls in (held at the end, in the air: the hoop)
    left stick up-down         the whole body control, by position: narrow at the bottom (the wing off, what G does),
                               above it the wing, its pitch rising with the stick to 90 deg at the top, which is the flare
                               (about 27 % of the travel is the 24 deg of the lifted gait; from 39 % it starts turning into the flare)
    left stick left-right      nothing
    the radio's button on ch5  automatic stabilisation (the balance assist) on / off, one press; off when a radio is connected
    the radio's button on ch6  connect / disconnect her poles, one press
    (G and F are not needed on the radio; both can still be given a control of their own on the page)

The radio sends its channels as X, Y, Z, Rx, Ry, Rz, Throttle, and browsers number those differently, so the defaults
are chosen by browser (both confirmed with the author's TX12 on 2026-09-20):

                               Chrome (Linux)   Firefox (Linux)
    right stick left-right     axis 0           axis 0
    right stick up-down        axis 1           axis 1
    left stick up-down         axis 2           button 6, analog: 0.00 at the bottom, 1.00 at the top
    left stick left-right      axis 3           axis 2
    button on ch5              axis 4           axis 3
    button on ch6              axis 5           button 7, analog
    (Firefox takes the radio for a standard gamepad: X, Y, Rx, Ry are its four stick axes and Z, Rz its two triggers)

A switch or button for the wing (the keyboard's G) is optional: on the radio, give a free channel a mix whose source is
that switch (MDL key, MIXES page, an empty channel such as CH6, Source: flip the switch, Weight 100); then on the page
press Assign next to "wing on / off" and flip it. "open while on" suits a two-position switch, "each press toggles" a
momentary button. With a wing switch assigned, the lift stick only sets the wing's pitch, over its whole travel.

Check list for the real radio (the axis numbers above are confirmed on the author's TX12; the rest is still to check):

- [ ] the card shows its name, and how many axes and buttons it reports
- [ ] each stick moves the axis bar the table above says; if not, Assign it, and Flip a direction that is reversed
- [ ] the left stick at the very bottom reads as narrow (if the wing never closes, the throttle end point is short: Flip and re-check, or trim the radio's end points)
- [ ] a flick right on the left stick lets go exactly once; holding it does not repeat
- [ ] it feels immediate (if there is a lag, note the browser and the radio's USB mode)
- [ ] if switches are wanted instead: they only arrive if the model on the radio mixes them to a channel; channels 1 to 8 come as axes, higher ones as buttons
