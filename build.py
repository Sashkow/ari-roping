"""Bundle the game into one self-contained page: dist/roping-ari.html.

Resolves `extends:` in levels/*.yaml, puts the physics constants of data/constants.json under every level,
embeds the ghosts that levels ask for, and concatenates the ES modules of src/ in dependency order with
their import/export statements removed. The modules therefore keep to named exports, relative imports of
named symbols, and unique top-level names. Run: make build
"""
import json, pathlib, re, sys

import yaml

HERE = pathlib.Path(__file__).parent
SRC, LEVELS, DATA, DIST = HERE / "src", HERE / "levels", HERE / "data", HERE / "dist"
BUDGET = 1_000_000
IMPORT = re.compile(r"^import\s+(?:\{[^}]*\}|\*\s+as\s+\w+)\s+from\s+'\./([\w.-]+)';?\s*$", re.M)


def merge(base, over):
    out = dict(base)
    for k, v in over.items():
        out[k] = merge(base[k], v) if isinstance(v, dict) and isinstance(base.get(k), dict) else v
    return out


def level(path, seen=()):
    data = yaml.safe_load(path.read_text())
    parent = data.pop("extends", None)
    assert path not in seen, f"levels extend each other in a circle at {path.name}"
    return merge(level(LEVELS / parent, seen + (path,)), data) if parent else data


def order(entry):
    done, out = set(), []
    def visit(name):
        if name in done: return
        done.add(name)
        text = (SRC / name).read_text()
        for dep in IMPORT.findall(text): visit(dep)
        out.append((name, text))
    visit(entry)
    return out


def bundle(entry="main.js"):
    parts = []
    for name, text in order(entry):
        text = IMPORT.sub("", text)
        text = re.sub(r"^export\s+(?=(?:async\s+)?(?:function|const|let|class)\b)", "", text, flags=re.M)
        assert not re.search(r"^export\s", text, flags=re.M), f"{name}: only named, declared exports can be bundled"
        parts.append(f"// ---- {name}\n{text.strip()}\n")
    return "\n".join(parts)


def main():
    constants = json.loads((DATA / "constants.json").read_text())
    levels = [level(p) for p in sorted(LEVELS.glob("*.yaml")) if p.name != "base.yaml"] or [level(LEVELS / "base.yaml")]
    ghosts = {}
    for lv in levels:
        if lv.get("ghost"):
            ghosts[lv["ghost"]] = json.loads((DATA / "ghosts" / f"{lv['ghost']}.json").read_text())
    for lv in levels:                      # YAML reads 1.0e9 (no sign in the exponent) as text; catch that here, not in the physics
        for section in ("tuning", "input"):
            for k, v in lv.get(section, {}).items():
                ok = lambda x: isinstance(x, (int, float)) and not isinstance(x, bool)
                assert ok(v) or (isinstance(v, list) and all(ok(x) for x in v)), f"level {lv.get('name')}: {section}.{k} = {v!r} is not a number"
    demos_file = DATA / "demos.json"                # written by tools/demo.mjs; the page replays each demo from its plan and marks its key moments
    demos = json.loads(demos_file.read_text()) if demos_file.exists() else {}
    data = dict(physics=constants["physics"], constants_sha256=constants["source_sha256"], levels=levels, ghosts=ghosts, demos=demos)
    shell = (SRC / "page.html").read_text()
    page = shell.replace("/*DATA*/null", json.dumps(data, separators=(",", ":")), 1).replace("/*BUNDLE*/", bundle(), 1)
    DIST.mkdir(exist_ok=True)
    out = DIST / "roping-ari.html"
    out.write_text(page)
    size = out.stat().st_size
    print(f"{out.relative_to(HERE)}: {size // 1024} KB, {len(levels)} level(s), {len(ghosts)} ghost(s), {len(demos)} demo(s)")
    if size > BUDGET:
        sys.exit(f"over the {BUDGET // 1000} KB budget")


if __name__ == "__main__":
    main()
