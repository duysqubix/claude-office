"""Headband: a fat terry sweatband around the forehead with a white centre stripe, sitting
low at the front and higher at the back. `Accent`. Pivot at the head centre."""
import math

from characters import _kit as kit
from characters import _monet as mo

import lib

NAME = "headband"
COLOR = "#FF5A5F"
TILT = -0.32
Z = 0.13
META = mo.meta("Headband", "character-hat", "Terry sweatband with a white stripe",
               ["hat", "headband", "sport", "gym"],
               anchors_bl={"headTop": (0, 0.01, 0.3)})


def build():
    lib.begin(NAME)
    hat = kit.m_accent(COLOR, rough=0.9)
    white = kit.flat("Stripe", "#FFFFFF", rough=0.85)

    def terry(co):
        a = math.atan2(co.y, co.x)
        k = 1.0 + 0.012 * math.cos(a * 40)
        co.x *= k
        co.y *= k

    r_head = math.sqrt(kit.R ** 2 - Z ** 2) + 0.006
    prof = [(r_head, -0.03), (r_head + 0.03, -0.03), (r_head + 0.036, 0.0),
            (r_head + 0.03, 0.03), (r_head, 0.03)]
    mo.hat_lathe("Band", prof + [prof[0]], hat, z=Z, tilt=TILT, verts=48, deform=terry, sub=1)
    stripe = [(r_head + 0.033, -0.007), (r_head + 0.039, -0.004), (r_head + 0.039, 0.004),
              (r_head + 0.033, 0.007), (r_head + 0.033, -0.007)]
    mo.hat_lathe("Stripe", stripe, white, z=Z, tilt=TILT, verts=48)


def finalize(name):
    return mo.finalize_head(name, META)
