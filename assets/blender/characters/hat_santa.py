"""Santa hat: a floppy red cone that rises off the head and droops to character-right, a fat
fluffy white cuff and a white pom-pom at the tip. `Accent` (red). Pivot at the head centre."""
import math

from mathutils import Vector

from characters import _kit as kit
from characters import _monet as mo

import lib

NAME = "hat_santa"
COLOR = "#E63946"
TILT = -0.14
Z = 0.11
TIP = Vector((-0.4, 0.1, Z + 0.1))
META = mo.meta("Santa hat", "character-hat", "Floppy Santa hat with a fluffy cuff and pom",
               ["hat", "santa", "seasonal", "holiday"], priority="P2",
               anchors_bl={"headTop": (0, 0.04, Z + 0.38), "pom": tuple(TIP)})


def build():
    lib.begin(NAME)
    red = kit.m_accent(COLOR, rough=0.85)
    fluff = kit.flat("Fluff", "#FFF6E8", rough=0.95)
    # Floppy cone: a tapered tube swept from inside the crown up and over to one side.
    ctrl = [Vector((0, 0.02, Z + 0.02)), Vector((0, 0.03, Z + 0.18)),
            Vector((-0.05, 0.06, Z + 0.32)), Vector((-0.22, 0.09, Z + 0.33)),
            Vector((-0.35, 0.1, Z + 0.22)), TIP]
    pts = kit.catmull(ctrl, samples=20)
    radii = [0.29 * (1 - i / (len(pts) - 1)) ** 1.1 + 0.025 for i in range(len(pts))]
    kit.tube("Cone", pts, radii, red, ring=24, caps=False)   # cuff + pom hide the ends

    def cuff_bumps(co):
        a = math.atan2(co.y, co.x)
        k = 1.0 + 0.04 * math.cos(a * 9)
        co.x *= k
        co.y *= k

    r = 0.3
    prof = [(r - 0.04, -0.04), (r + 0.03, -0.045), (r + 0.06, 0.0), (r + 0.03, 0.045),
            (r - 0.04, 0.04), (r - 0.04, -0.04)]
    mo.hat_lathe("Cuff", prof, fluff, z=Z, tilt=TILT, verts=36, deform=cuff_bumps, sub=1)
    lib.blob("Pom", 0.06, tuple(TIP + Vector((-0.02, 0, -0.01))), fluff, levels=2)


def finalize(name):
    return mo.finalize_head(name, META)
