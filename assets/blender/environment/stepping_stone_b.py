"""Stepping stone B: one flat faceted paver for the garden trail, a smaller oval, gently
domed with a chamfered rim, about 0.50 x 0.38 m and 2.5 cm proud of the lawn (its sides sink
3 cm in, so it never floats). Variants: stepping_stone_a, _b, _c. Origin at its centre on the
ground; instance it with random yaw."""
import lib
from environment import _env

NAME = "stepping_stone_b"
AO_RES = 128
AO_DISTANCE = 0.05


def build():
    lib.begin(NAME)
    _env.paver("Stone", 0.25, 0.19, lib.mat("Paver", "#C9C3B8", rough=0.85), seed=9)


META = dict(
    name="Stepping stone B", category="outdoor", priority="P1",
    description="Flat faceted stepping stone for the garden trail (a smaller oval)",
    tags=["path", "trail", "garden", "paver", "scatter"], tintable=[], anchors={},
    notes="45 tris. One of three variants (stepping_stone_a / _b / _c); mix them along the trail.",
)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META, strength=0.8)
