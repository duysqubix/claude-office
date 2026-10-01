"""Headless build: model → AO bake → GLB → preview, for every artist's folder.

  /Applications/Blender.app/Contents/MacOS/Blender --background \\
      --python assets/blender/build.py -- <id|category|all> [...]

Each model lives in assets/blender/<category>/<id>.py and defines build() (and optionally
AO_RES, AO_DISTANCE, or its own finalize(id) for models that need special handling).
"""
import importlib
import os
import sys
import traceback

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import lib  # noqa: E402

CATEGORIES = ["props", "decor", "environment", "characters"]


def discover():
    found = {}
    for cat in CATEGORIES:
        folder = os.path.join(HERE, cat)
        if not os.path.isdir(folder):
            continue
        for f in sorted(os.listdir(folder)):
            if f.endswith(".py") and not f.startswith("_"):
                found[f[:-3]] = cat
    return found


def build_one(name, cat):
    mod = importlib.import_module("%s.%s" % (cat, name))
    lib.clear_scene()
    mod.build()
    if hasattr(mod, "finalize"):
        report = mod.finalize(name)
    else:
        report = lib.finalize(name, ao_res=getattr(mod, "AO_RES", 512),
                              ao_distance=getattr(mod, "AO_DISTANCE", 0.35))
    print("[build] %s/%s: %s" % (cat, name, report))
    return report


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    models = discover()
    wanted = []
    for arg in argv or ["all"]:
        if arg == "all":
            wanted += list(models)
        elif arg in CATEGORIES:
            wanted += [n for n, c in models.items() if c == arg]
        elif arg in models:
            wanted.append(arg)
        else:
            print("[build] unknown model or category: %s" % arg)
    failed = []
    for name in dict.fromkeys(wanted):
        try:
            build_one(name, models[name])
        except Exception:
            traceback.print_exc()
            failed.append(name)
    if failed:
        print("[build] FAILED: %s" % ", ".join(failed))
        sys.exit(1)


main()
