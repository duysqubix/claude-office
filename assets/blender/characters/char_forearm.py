"""Forearm: elbow to wrist, a soft `Skin` capsule (r 0.066, 0.13 long); tint it the shirt
colour for long sleeves. Pivot at the elbow; it hangs down -Y (three.js)."""
from characters import _body as B
from characters import _kit as kit

import lib

NAME = "char_forearm"
META = dict(
    name="Forearm", category="character-body", priority="P0",
    description="Elbow-to-wrist capsule; pivot at the elbow",
    tags=["body", "arm"], tintable=["Skin"],
    anchors_bl={"wrist": (0, 0, -B.L["forearm"]["len"])},
)


def build():
    lib.begin(NAME)
    B.forearm(B.materials())


def finalize(name):
    return kit.finalize(name, META, ao=False)
