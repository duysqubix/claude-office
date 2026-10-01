"""Hard hat: a chunky construction helmet with a rounded dome, a raised ridge from front to
back, a narrow rim and a jutting front peak. `Accent` (safety yellow). Pivot at the head
centre."""
import math

from characters import _kit as kit
from characters import _monet as mo

import lib

NAME = "hat_hard"
COLOR = "#FFC93C"
TILT = -0.16
Z = 0.1
META = mo.meta("Hard hat", "character-hat", "Chunky yellow construction hard hat",
               ["hat", "hard-hat", "safety", "work"],
               anchors_bl={"headTop": mo.tilted((0, 0, Z + 0.33), TILT)})


def build():
    lib.begin(NAME)
    hat = kit.m_accent(COLOR, rough=0.45)
    prof = [(0.26, 0.02), (0.33, -0.005), (0.345, 0.005), (0.32, 0.03), (0.31, 0.1),
            (0.28, 0.2), (0.21, 0.27), (0.11, 0.31), (0.0, 0.32)]
    mo.hat_lathe("Dome", prof, hat, z=Z, tilt=TILT, verts=32, sub=1)
    # Ridge over the top, front to back.
    lib.torus("Ridge", 0.29, 0.03, mo.tilted((0, 0, Z + 0.02), TILT), hat, seg=18, ring=8,
              sweep=math.radians(150), rot=(math.pi / 2 + TILT, 0, math.pi / 2 + 0.0))
    peak = lib.slab("Peak", lib.stadium(0.26, 0.07, 8), -0.009, 0.009,
                    mo.tilted((0, -0.34, Z + 0.0), TILT), hat, r=0.008, seg=2,
                    rot=(TILT - 0.25, 0, 0))
    lib.subsurf(peak, 1)


def finalize(name):
    return mo.finalize_head(name, META)
