"""Witch hat: a wide floppy brim and a tall cone crown whose tip bends back and over, with an
orange band and a gold buckle. `Accent` (deep purple). Pivot at the head centre."""
import math

from characters import _kit as kit
from characters import _monet as mo

import lib

NAME = "hat_witch"
COLOR = "#4B3F72"
TILT = -0.14
Z = 0.13
H = 0.62
META = mo.meta("Witch hat", "character-hat", "Tall bent witch hat with a wide brim",
               ["hat", "witch", "seasonal", "halloween"], priority="P2",
               anchors_bl={"headTop": mo.tilted((0, 0.25, Z + H - 0.05), TILT)})


def build():
    lib.begin(NAME)
    hat = kit.m_accent(COLOR, rough=0.7)
    band = kit.flat("Band", "#FF9F45", rough=0.6)
    gold = kit.flat("Buckle", "#F2C14E", rough=0.3, metal=0.5)

    def bend(co):
        if co.z > 0.25:                               # tip flops back (+Y) and droops
            t = (co.z - 0.25) / (H - 0.25)
            co.y += 0.32 * t * t
            co.z -= 0.12 * t ** 3
        r = math.hypot(co.x, co.y)
        if r > 0.36 and co.z < 0.05:                  # wavy floppy brim
            a = math.atan2(co.y, co.x)
            co.z += 0.025 * math.sin(a * 3) * (r - 0.36) / 0.14

    prof = [(0.25, 0.02), (0.34, 0.0), (0.48, -0.02), (0.5, -0.01), (0.47, 0.005),
            (0.33, 0.02), (0.29, 0.04), (0.25, 0.12), (0.19, 0.24), (0.13, 0.36), (0.075, 0.47),
            (0.035, 0.56), (0.01, 0.61), (0.0, H)]
    ob = mo.hat_lathe("Hat", prof, hat, z=Z, tilt=TILT, verts=32)
    for v in ob.data.vertices:
        bend(v.co)
    lib.subsurf(ob, 1)
    bp = [(0.29, 0.035), (0.297, 0.04), (0.29, 0.1), (0.282, 0.105), (0.28, 0.06),
          (0.29, 0.035)]
    mo.hat_lathe("Band", bp, band, z=Z, tilt=TILT, verts=32)
    lib.rbox("Buckle", (0.07, 0.012, 0.06), mo.tilted((0, -0.293, Z + 0.07), TILT), gold,
             r=0.008, seg=1, rot=(TILT - 0.15, 0, 0))


def finalize(name):
    return mo.finalize_head(name, META)
