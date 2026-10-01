"""Beret: a soft, puffy flat disc slouched toward character-left with a tiny stalk on top.
`Accent`. Pivot at the head centre."""
from characters import _kit as kit
from characters import _monet as mo

import lib

NAME = "hat_beret"
COLOR = "#E63946"
TILT, ROLL = -0.2, 0.3
Z = 0.17
META = mo.meta("Beret", "character-hat", "Slouchy puffy beret with a little stalk",
               ["hat", "beret", "artist"],
               anchors_bl={"headTop": mo.tilted((0.05, 0, Z + 0.15), TILT, ROLL)})


def build():
    lib.begin(NAME)
    hat = kit.m_accent(COLOR, rough=0.85)
    prof = [(0.2, 0.0), (0.27, 0.0), (0.33, 0.03), (0.35, 0.07), (0.32, 0.11), (0.22, 0.14),
            (0.1, 0.15), (0.0, 0.15)]
    mo.hat_lathe("Beret", prof, hat, z=Z, tilt=TILT, roll=ROLL, verts=32, sub=1,
                 loc_xy=(0.04, 0.0))
    stalk = mo.tilted((0.0, 0, Z + 0.16), TILT, ROLL)
    lib.cyl("Stalk", 0.012, 0.04, (stalk[0] + 0.04, stalk[1], stalk[2]), hat, r=0.005, seg=1,
            verts=10, rot=(TILT, ROLL, 0))


def finalize(name):
    return mo.finalize_head(name, META)
