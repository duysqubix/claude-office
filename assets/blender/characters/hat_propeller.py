"""Propeller cap: a four-panel beanie cap (alternating `Accent` and yellow panels) with a tiny
bill, a stem on top and a two-blade propeller as node `Propeller` (pivot on the stem axis,
spin about the vertical). Pivot at the head centre."""
import math

from characters import _kit as kit
from characters import _monet as mo

import lib

NAME = "hat_propeller"
COLOR = "#FF5A5F"
TILT = -0.12
Z = 0.08
TOP = Z + 0.33
META = mo.meta("Propeller cap", "character-hat", "Beanie cap with a spinning propeller",
               ["hat", "propeller", "fun", "intern"],
               anchors_bl={"headTop": mo.tilted((0, 0, TOP + 0.08), TILT)},
               nodes={"Propeller": "spin about +Y (three) around its origin"})


def build():
    lib.begin(NAME)
    hat = kit.m_accent(COLOR, rough=0.6)
    yellow = kit.flat("Panel", "#FFD93D", rough=0.6)
    blue = kit.flat("Blade", "#4D96FF", rough=0.5)
    stem_m = kit.flat("Stem", "#2B2D42", rough=0.5)
    prof = [(0.262, 0.03), (0.3, 0.02), (0.31, 0.08), (0.29, 0.18), (0.23, 0.27), (0.12, 0.32),
            (0.0, 0.33)]
    dome = mo.hat_lathe("Dome", prof, hat, z=Z, tilt=TILT, verts=32, sub=1)
    dome.data.materials.append(yellow)
    for p in dome.data.polygons:                     # quarter panels
        a = math.degrees(math.atan2(p.center.y, p.center.x)) % 360
        if int(a // 90) % 2 == 1:
            p.material_index = 1
    lib.slab("Bill", lib.stadium(0.18, 0.06, 8), -0.008, 0.008,
             mo.tilted((0, -0.31, Z + 0.03), TILT), hat, r=0.007, seg=2, rot=(TILT - 0.2, 0, 0))
    stem_c = mo.tilted((0, 0, TOP + 0.02), TILT)
    lib.cyl("Stem", 0.012, 0.05, stem_c, stem_m, r=0.004, seg=1, verts=10, rot=(TILT, 0, 0))
    hub = mo.tilted((0, 0, TOP + 0.05), TILT)
    parts = [lib.sphere("Hub", 0.022, hub, stem_m, u=12, v=6)]
    for s in (-1, 1):
        b = lib.sphere(f"Blade{s}", 1.0, mo.tilted((s * 0.085, 0, TOP + 0.05), TILT),
                       blue if s > 0 else yellow, scale=(0.075, 0.03, 0.008), u=12, v=6,
                       rot=(TILT, s * 0.25, 0))
        parts.append(b)
    for p in parts:
        lib.node(p, "Propeller", pivot=hub)


def finalize(name):
    return mo.finalize_head(name, META)
