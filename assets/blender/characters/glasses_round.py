"""Round glasses: Chunky round specs. Rims and temples in `Accent`, lenses alpha-blended (`Lens`).
Sits on the face over the eyes; pivot at the head centre."""
import math

from characters import _kit as kit
from characters import _monet as mo

import lib

NAME = "glasses_round"
META = mo.meta("Round glasses", "character-face", "Chunky round specs", ["glasses", "face", "circle"],
               priority="P0", anchors_bl={"bridge": (0, -0.3, kit.EYE_Y)})


def loop():
    if "circle" == "circle":
        return [(0.064 * math.cos(2 * math.pi * i / 24), 0.064 * math.sin(2 * math.pi * i / 24))
                for i in range(24)]
    if "circle" == "square":
        return kit.rrect_loop(0.07, 0.056, 0.022, n=4)
    return kit.rrect_loop(0.082, 0.062, 0.034, n=5)     # shades: big soft rectangles


def build():
    lib.begin(NAME)
    rim = kit.m_accent("#2B2D42", rough=0.45)
    lens = kit.translucent("Lens", "#DFF3FF", 0.3, rough=0.1)
    mo.glasses(loop(), rim, lens, rim_r=0.009)


def finalize(name):
    return mo.finalize_head(name, META, ao_distance=0.04)
