# Roping Ari, the game. Python only builds (needs PyYAML); node runs the tests.
PYTHON ?= /opt/ro/venv/bin/python
NODE ?= node

.PHONY: check build site export clean

check:            ## node tests: physics parity with the Python simulations, unit tests
	$(NODE) --test tests/

build:            ## one self-contained page: dist/roping-ari.html
	$(PYTHON) build.py

site: build       ## the public site (built pages only) in ../ari-roping-site, for GitHub Pages
	$(PYTHON) make_site.py

export:           ## refresh data/ from the simulations in ../radio_ocean (slow: solves the runs)
	$(MAKE) -C ../radio_ocean export-roping

clean:
	rm -rf dist
