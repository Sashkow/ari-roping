# Demos first (task 12.4)

Made 2026-09-23 by `node tools/demo.mjs` from the candidates in `src/demos.js`; the page replays each from
its plan and numbers the key moments (`make build`, then open `dist/roping-ari.html` with the hash in the
page column; the Demos card on the page links them all). Every plan is a scripted key driver with a small
parameter grid; "does not close" means no combination in the grid produced the shape, with the nearest miss
in the numbers column. That is a statement about the plans as much as about the physics.

Picks are the author's: fill the last column (badge / surprise row / drop), with the date.

| candidate | kind | shape | result | numbers | page | pick |
|---|---|---|---|---|---|---|
| Backflip | badge | net turns of −1 or less in one flight, then caught | does not close | turns -0.75, caught True | `dist/roping-ari.html#demo=backflip` | |
| Stalled | badge | at the apex, spread, vertical speed within 0.2 m/s for 0.3 s: hanging on the wing | does not close | hang_s 0.08 | `dist/roping-ari.html#demo=stalled` | |
| Spun down | badge | the hoop, then opened, then a soft catch | **closes** | order CURL → OPEN → CATCH.soft | `dist/roping-ari.html#demo=spun_down` | |
| Held it | badge | a hard catch (over the absorption limit) survived under the body-load limit | **closes** |  | `dist/roping-ari.html#demo=held_it` | |
| Through the arc | badge | arced between the wires, stayed on, and still passed the bus | **closes** | arc True | `dist/roping-ari.html#demo=through_the_arc` | |
| Sailplane | badge | the lifted gait with the poles pushing and lift above her weight | **closes** | at_s 0, lift_pct 140, push_N 33 | `dist/roping-ari.html#demo=sailplane` | |
| Short-pole flight | badge | the lifted gait held for 2 s at the shortest pole length | does not close | held_s 1.5 | `dist/roping-ari.html#demo=short_pole_flight` | |
| Hoop over the roof | badge | curled into the hoop with her head above the trolleybus | **closes** | at_s 3.27 | `dist/roping-ari.html#demo=hoop_over_roof` | |
| Kiss | badge | a catch with under 0.5 m/s of speed along the poles to absorb | **closes** | along_mps 0.42 | `dist/roping-ari.html#demo=kiss` | |
| One press | badge | past the bus with exactly one release and one catch | **closes** | releases 1, catches 1 | `dist/roping-ari.html#demo=one_press` | |
| Late catch | badge | caught with the poles within 0.3 m of their full length | does not close | margin_m 0.45 | `dist/roping-ari.html#demo=late_catch` | |
| Swoop | line | REL → SPREAD → CATCH → LIFTED before the swing back (soft or hard catch: that is Kiss / Held it) | **closes** | got REL → SPREAD → CATCH.hard → LIFTED, lifted_after_catch_s 0.71, held_s 2.42 | `dist/roping-ari.html#demo=swoop` | |
| Touch and go | line | CATCH → REL within 0.5 s, and that flight caught again | does not close | gap_s 1.47, caught_again True | `dist/roping-ari.html#demo=touch_and_go` | |
| Stitch | line | three catches with at most two swings back between the first and the third | does not close | catches 2, span_s None | `dist/roping-ari.html#demo=stitch` | |
| Rolled up | line | REL → CURL → OPEN → SPREAD → CATCH in one flight | **closes** | got REL → CURL → OPEN → SPREAD → CATCH.hard | `dist/roping-ari.html#demo=rolled_up` | |
| Over and on | line | REL → SPREAD → OVER → CATCH → LIFTED before the swing back: the glider hop that ends in flight (the reach folds her narrow, so NARROW within 0.6 s of the catch is allowed) | **closes** | got REL → SPREAD → OVER → CATCH → LIFTED, held_s 2.42 | `dist/roping-ari.html#demo=over_and_on` | |
| Through the fire | line | ARC → (arc out) → SPREAD → LIFTED before the swing back | **closes** | got ARC → SPREAD → LIFTED, held_s to the end | `dist/roping-ari.html#demo=through_the_fire` | |
| One breath | line | PULL → REL → CATCH → PASS in under 3 s | **closes** | breath_s 1.66 | `dist/roping-ari.html#demo=one_breath` | |
| Full repertoire | line | REL, CURL, OPEN, SPREAD, CATCH and LIFTED, in any order, within 6 s | **closes** | got REL CURL OPEN SPREAD CATCH LIFTED, span_s 5.39, held_s to the end | `dist/roping-ari.html#demo=full_repertoire` | |

Notes from making them:

- Spreading right after a release strikes the arc, because she rises through the wire plane spread. Every
  gliding plan puts the wing on only above the wires (`glide` in `demos.js`). A player will find this the
  hard way; the arc itself is `through_the_arc`.
- The reach folds her narrow (`spread && !reaching` in `game.js`), so no hop can be flown spread to the
  moment of the catch. `over_and_on` allows NARROW within 0.6 s of the catch for that reason; 9.9 "Glider
  hop!" needs the same tolerance.
- Almost every catch is hard: the reach runs the poles at 14 m/s and the catch has to absorb it. Soft
  catches came only from the hoop's own timing (`spun_down`) and from `kiss`, where the grid found a
  commit height at which the poles were already the right length (0.42 m/s along them).
- The lifted gait after a catch: the page's recipe (speed up, then brake) sends her back first. What
  worked is to brake at once on the forward swing the catch gives her, wing on past 30 to 40 degrees, and
  the assist holds it from 35 degrees (`goLifted`). She then enters the gait 0.55 to 0.7 s after the catch,
  before the swing back. Some entries go over the top (lead 79 degrees) and arc.
- A demo runs on past the win, since the game otherwise ends 1.5 s after she passes the bus and every line
  that ends in the lifted gait needs longer.
- `held_it` closes trivially: the body-load limit in `base.yaml` is impossibly high, so every hard catch
  survives. It becomes a real badge only when the limit is set.
- `sailplane` closes at t = 0 because the lifted start already has lift above her weight at 79 km/h.
- Six do not close in these grids: `backflip` (−0.75 turns of the −1 needed), `stalled` (0.08 s of the
  0.3 s), `short_pole_flight` (1.5 s of 2 s, then the assist loses her), `late_catch` (0.45 m of the
  0.3 m margin), `touch_and_go` (caught again, but 1.47 s after the catch, not 0.5), `stitch` (two
  catches, not three). Candidates for the surprise table, or for better plans.
