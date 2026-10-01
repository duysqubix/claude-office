"""Bucket hat: a soft oversized crown with a flat-ish top, a wide brim drooping all round and
a contrast band. `Accent`. Pivot at the head centre."""
from characters import _kit as kit
from characters import _monet as mo

import lib

NAME = "hat_bucket"
COLOR = "#6BCB77"
TILT = -0.18
Z = 0.1           # lift so the brim clears the eyes
META = mo.meta("Bucket hat", "character-hat", "Soft oversized bucket hat with a droopy brim",
               ["hat", "bucket", "summer"],
               anchors_bl={"headTop": mo.tilted((0, 0, 0.37 + Z), TILT)})


def build():
    lib.begin(NAME)
    M = mo.band_materials(COLOR, band="#2F3E66")
    prof = [(0.255, 0.05), (0.33, 0.0), (0.39, -0.04), (0.405, -0.055), (0.4, -0.036),
            (0.35, 0.0), (0.315, 0.04), (0.315, 0.1), (0.31, 0.2), (0.295, 0.29), (0.25, 0.345),
            (0.14, 0.365), (0.0, 0.37)]
    mo.hat_lathe("Bucket", prof, M["hat"], z=Z, tilt=TILT, verts=28, sub=1)
    band = [(0.317, 0.035), (0.322, 0.045), (0.322, 0.09), (0.317, 0.1), (0.31, 0.09),
            (0.31, 0.045), (0.317, 0.035)]
    mo.hat_lathe("Band", band, M["band"], z=Z, tilt=TILT, verts=28)


def finalize(name):
    return mo.finalize_head(name, META)
