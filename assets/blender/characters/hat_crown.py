"""Crown: a chunky gold crown sitting on top of the head: a rounded band, five fat points
with ball tips and `Accent` jewels set in the band. Pivot at the head centre."""
import math

from characters import _kit as kit
from characters import _monet as mo

import lib

NAME = "hat_crown"
TILT = -0.08
Z = 0.17
META = mo.meta("Crown", "character-hat", "Chunky gold crown with ball-tipped points and jewels",
               ["hat", "crown", "royal", "reward"],
               anchors_bl={"headTop": mo.tilted((0, 0, Z + 0.26), TILT)})


def build():
    lib.begin(NAME)
    gold = kit.flat("Gold", "#F2C14E", rough=0.3, metal=0.5)
    jewel = kit.m_accent("#E63946", rough=0.25)
    band = [(0.2, 0.0), (0.235, 0.0), (0.245, 0.02), (0.245, 0.08), (0.235, 0.1), (0.2, 0.1),
            (0.2, 0.0)]
    mo.hat_lathe("Band", band, gold, z=Z, tilt=TILT, verts=36)
    for i in range(5):
        a = math.radians(-90 + i * 72)
        d = (math.cos(a), math.sin(a))
        lib.cyl(f"Point{i}", 0.06, 0.13, mo.tilted((d[0] * 0.22, d[1] * 0.22, Z + 0.16), TILT),
                gold, radius2=0.012, r=0.01, seg=1, verts=12, rot=(TILT, 0, 0))
        lib.sphere(f"Tip{i}", 0.026, mo.tilted((d[0] * 0.22, d[1] * 0.22, Z + 0.235), TILT),
                   gold, u=12, v=6)
        b = math.radians(-54 + i * 72)
        lib.sphere(f"Jewel{i}", 0.022, mo.tilted((math.cos(b) * 0.247, math.sin(b) * 0.247,
                   Z + 0.05), TILT), jewel, scale=(1, 1, 1), u=10, v=6)


def finalize(name):
    return mo.finalize_head(name, META)
