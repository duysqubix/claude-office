"""Shin: knee to ankle, a soft capsule (r 0.078, 0.15 long) in `Pants`, flaring a touch to a
rolled cuff at the ankle. Pivot at the knee; it hangs down -Y (three.js)."""
from characters import _body as B
from characters import _kit as kit

import lib

NAME = "char_shin"
META = dict(
    name="Shin", category="character-body", priority="P0",
    description="Knee-to-ankle capsule in pants with a rolled cuff; pivot at the knee",
    tags=["body", "leg", "pants"], tintable=["Pants"],
    anchors_bl={"ankle": (0, 0, -B.L["shin"]["len"])},
)


def build():
    lib.begin(NAME)
    B.shin(B.materials())


def finalize(name):
    return kit.finalize(name, META, ao=False)
