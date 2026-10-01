"""Sunglasses: Big dark sunglasses. Rims and temples in `Accent`, lenses alpha-blended (`Lens`).
Sits on the face over the eyes; pivot at the head centre."""
import math

from characters import _kit as kit
from characters import _monet as mo

import lib

NAME = "sunglasses"
META = mo.meta("Sunglasses", "character-face", "Big dark sunglasses", ["glasses", "face", "shades"],
               priority="P0", anchors_bl={"bridge": (0, -0.3, kit.EYE_Y)})


def loop():
    if "shades" == "circle":
        return [(0.064 * math.cos(2 * math.pi * i / 24), 0.064 * math.sin(2 * math.pi * i / 24))
                for i in range(24)]
    if "shades" == "square":
        return kit.rrect_loop(0.07, 0.056, 0.022, n=4)
    return kit.rrect_loop(0.082, 0.062, 0.034, n=5)     # shades: big soft rectangles


def build():
    lib.begin(NAME)
    rim = kit.m_accent("#2B2D42", rough=0.45)
    lens = kit.translucent("Lens", "#1B2330", 0.95, rough=0.1)
    mo.glasses(loop(), rim, lens, rim_r=0.013)


def finalize(name):
    return mo.finalize_head(name, META, ao_distance=0.04)
