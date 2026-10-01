"""Chef's hat: a tall puffy toque. A white pleated band hugging the head and a big billowy
mushroom top with soft lumps. Plain white (no tint). Pivot at the head centre."""
import math

from characters import _kit as kit
from characters import _monet as mo

import lib

NAME = "hat_chef"
TILT = -0.12
Z = 0.1
META = mo.meta("Chef's hat", "character-hat", "Tall puffy chef's toque", ["hat", "chef", "kitchen"],
               tintable=(), anchors_bl={"headTop": mo.tilted((0, 0, Z + 0.56), TILT)})


def build():
    lib.begin(NAME)
    white = kit.flat("Toque", "#FFFFFF", rough=0.8)
    shade = kit.flat("ToqueBand", "#F4F1EA", rough=0.8)

    def pleats(co):
        r = math.hypot(co.x, co.y)
        if r > 0.2:
            a = math.atan2(co.y, co.x)
            k = 1.0 + 0.025 * math.cos(a * 16)
            co.x *= k
            co.y *= k

    band = [(0.262, 0.0), (0.29, 0.005), (0.295, 0.06), (0.293, 0.15), (0.27, 0.16),
            (0.0, 0.16)]
    mo.hat_lathe("Band", band, shade, z=Z, tilt=TILT, verts=48, deform=pleats)

    def puff(co):
        a = math.atan2(co.y, co.x)
        if co.z > 0.12:
            k = 1.0 + 0.07 * math.cos(a * 6)
            co.x *= k
            co.y *= k

    top = [(0.27, 0.13), (0.33, 0.18), (0.38, 0.27), (0.39, 0.36), (0.36, 0.43),
           (0.28, 0.47), (0.15, 0.49), (0.0, 0.5)]
    mo.hat_lathe("Puff", top, white, z=Z, tilt=TILT, verts=36, deform=puff, sub=1)


def finalize(name):
    return mo.finalize_head(name, META)
