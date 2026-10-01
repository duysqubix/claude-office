"""Cowboy hat: a pinched crown with a centre crease, a wide brim that curls up at the sides
and dips at front and back, and a dark band. `Accent` (tan leather). Pivot at the head
centre."""
import math

from characters import _kit as kit
from characters import _monet as mo

import lib

NAME = "hat_cowboy"
COLOR = "#C98F5A"
TILT = -0.14
Z = 0.13
META = mo.meta("Cowboy hat", "character-hat", "Wide-brimmed cowboy hat with curled sides",
               ["hat", "cowboy", "western"],
               anchors_bl={"headTop": mo.tilted((0, 0, Z + 0.3), TILT)})


def build():
    lib.begin(NAME)
    M = mo.band_materials(COLOR, band="#3B2A20")

    def shape(co):
        r = math.hypot(co.x, co.y)
        if r > 0.3:                                  # brim: curl up at the sides
            side = (co.x / max(r, 1e-6)) ** 2
            co.z += 0.22 * side * (r - 0.3) / 0.16 * (r - 0.25)
            co.z -= 0.02 * (1 - side) * (r - 0.3) / 0.16
        if co.z > 0.2:                               # crown: front pinch and top crease
            co.x *= 1.0 - 0.25 * max(0.0, -co.y) / 0.3 * (co.z - 0.2) / 0.1
            co.z -= 0.05 * math.exp(-(co.x / 0.06) ** 2) * (co.z - 0.2) / 0.1

    prof = [(0.25, 0.02), (0.33, 0.0), (0.44, -0.01), (0.47, 0.0), (0.45, 0.012),
            (0.33, 0.02), (0.285, 0.04), (0.28, 0.14), (0.27, 0.24), (0.23, 0.29),
            (0.12, 0.305), (0.0, 0.3)]
    mo.hat_lathe("Hat", prof, M["hat"], z=Z, tilt=TILT, verts=40, deform=shape, sub=1)
    band = [(0.285, 0.035), (0.292, 0.042), (0.29, 0.085), (0.283, 0.09), (0.278, 0.06),
            (0.285, 0.035)]
    mo.hat_lathe("Band", band, M["band"], z=Z, tilt=TILT, verts=32)


def finalize(name):
    return mo.finalize_head(name, META)
