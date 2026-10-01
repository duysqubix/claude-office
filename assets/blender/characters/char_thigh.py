"""Thigh: hip to knee, a fat soft capsule (r 0.085, 0.17 long) in `Pants`. Pivot at the hip;
it hangs down -Y (three.js)."""
from characters import _body as B
from characters import _kit as kit

import lib

NAME = "char_thigh"
META = dict(
    name="Thigh", category="character-body", priority="P0",
    description="Hip-to-knee capsule in pants; pivot at the hip",
    tags=["body", "leg", "pants"], tintable=["Pants"],
    anchors_bl={"knee": (0, 0, -B.L["thigh"]["len"])},
)


def build():
    lib.begin(NAME)
    B.thigh(B.materials())


def finalize(name):
    return kit.finalize(name, META, ao_distance=0.05)
