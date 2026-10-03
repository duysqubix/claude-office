"""Stepping stone A: one flat faceted paver for the garden trail, a rounded pentagon-ish slab, gently
domed with a chamfered rim, about 0.58 x 0.46 m and 2.5 cm proud of the lawn (its sides sink
3 cm in, so it never floats). Variants: stepping_stone_a, _b, _c. Origin at its centre on the
ground; instance it with random yaw."""
import lib
from environment import _env

NAME = "stepping_stone_a"
AO_RES = 128
AO_DISTANCE = 0.05


def build():
    lib.begin(NAME)
    _env.paver("Stone", 0.29, 0.23, lib.mat("Paver", "#D6CBB7", rough=0.85), seed=5)


META = dict(
    name="Stepping stone A", category="outdoor", priority="P1",
    description="Flat faceted stepping stone for the garden trail (a rounded pentagon-ish slab)",
    tags=["path", "trail", "garden", "paver", "scatter"], tintable=[], anchors={},
    notes="45 tris. One of three variants (stepping_stone_a / _b / _c); mix them along the trail.",
)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META, strength=0.8)
