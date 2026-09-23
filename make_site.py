"""SPDX-License-Identifier: GPL-3.0-or-later
Assemble the public site (GitHub Pages) in ../ari-roping-site: the built game and the demo pages of
../radio_ocean/notes/scenes/ari-roping, each wrapped as a complete HTML document, plus a landing page.
Built pages only: no sources, no data files. Run: make site   (after make build)
"""
import pathlib, re, sys

HERE = pathlib.Path(__file__).parent
OUT = HERE.parent / "ari-roping-site"
DEMOS = HERE.parent / "radio_ocean" / "notes" / "scenes" / "ari-roping"
HEAD = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<link rel="license" href="https://creativecommons.org/licenses/by-sa/4.0/">\n<!-- Page, notes and data: CC BY-SA 4.0. Game code: GPL-3.0-or-later. Sources: https://github.com/Sashkow/ari-roping -->\n<style>body{margin:0}[hidden]{display:none!important}</style>\n'
PAGES = [  # (source, published name, title, one line)
    (HERE / "dist" / "roping-ari.html", "game.html", "Roping Ari, the Game",
     "Ride the two trolleybus wires at 79 km/h on her poles and get over the trolleybus ahead. Keyboard. Press A to watch it done once."),
    (HERE / "kept" / "roping-ari-kinematic-2026-09-23.html", "game-kinematic.html", "Roping Ari, the Game, kinematic tips",
     "The game as built on 2026-09-23, before her tips became a mass on the wire: infinite grip, no friction, 1 kg poles. Kept playable."),
    (DEMOS / "ari-roping-pulled.html", "at-speed.html", "Roping Ari at Speed",
     "Four solved ways over a trolleybus from 79 km/h, side view, to scale; playback stops at each key moment and shows its numbers."),
    (DEMOS / "gaits.html", "gaits.html", "Ari's Wire Gaits",
     "Where her body sits relative to her pole tips at a steady speed: pulled, or lifted and flying ahead of them. Four scenarios."),
    (DEMOS / "ari-roping.html", "first-version.html", "Roping Ari, the first version",
     "The move at town speed: brake, back swing, drive, release at 60°, hoop over the bus, catch, one full circle."),
]


def wrap(text):
    assert "<!doctype" not in text.lower()[:200]
    return HEAD + text.rstrip() + "\n</body>\n</html>\n" if "<body" in text else HEAD + text.rstrip() + "\n</html>\n"


def main():
    OUT.mkdir(exist_ok=True)
    cards = []
    for src, name, title, line in PAGES:
        if not src.exists():
            sys.exit(f"missing {src}: run make build (and the simulations) first")
        (OUT / name).write_text(wrap(src.read_text()))
        cards.append(f'    <a class="card{" play" if name == "game.html" else ""}" href="{name}"><h2>{title}</h2><p>{line}</p></a>')
        print(f"{name:20s} {(OUT / name).stat().st_size // 1024:5d} KB")
    import json
    demos = json.loads((HERE / "kept" / "demos-kinematic-2026-09-23.json").read_text())      # the demos of the kept kinematic build, frozen with it
    items = [f'      <li><a href="game-kinematic.html#demo={k}">{d["title"]}</a> <span>{d["kind"]}: {d["what"].split(" (")[0]}</span></li>' for k, d in demos.items()]
    index = (HERE / "site_index.html").read_text().replace("<!--CARDS-->", "\n".join(cards)).replace("<!--DEMOS-->", "\n".join(items))
    (OUT / "index.html").write_text(index)
    (OUT / ".nojekyll").write_text("")
    print(f"site in {OUT}")


if __name__ == "__main__":
    main()
