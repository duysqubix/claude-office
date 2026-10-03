"""Flowering bush: a round faceted bush of lumpy low-poly puffs, darker underneath and lighter
on top, dotted with pink, cream and coral blossoms facing out from its upper half. About
1.3 m across, 0.95 m tall. Origin at the ground centre."""
import math

from mathutils import Vector

import lib
from environment import _env

NAME = "bush_flowering"
AO_RES = 256
AO_DISTANCE = 0.4

# (x, y, z, radius, material). Materials: 0 Leaf, 1 LeafDark, 2 LeafLight.
PUFFS = [
    (0.0, 0.0, 0.38, 0.44, 0),
    (0.36, -0.1, 0.24, 0.31, 1), (-0.34, -0.14, 0.23, 0.3, 1), (-0.05, -0.33, 0.21, 0.27, 1),
    (0.3, 0.26, 0.25, 0.31, 1), (-0.32, 0.24, 0.26, 0.32, 0),
    (0.12, -0.12, 0.62, 0.28, 2), (-0.16, 0.12, 0.64, 0.27, 2),
]


def blossoms(mats):
    """Twelve flowers spread over the upper bush, facing out."""
    rnd = _env.rng(14)
    n = 12
    for k in range(n):
        up = 0.15 + 0.8 * (k + 0.5) / n
        a = k * 2.39996
        d = Vector((math.cos(a) * math.sqrt(1 - up * up), math.sin(a) * math.sqrt(1 - up * up),
                    up)).normalized()
        at = _env.puff_surface(PUFFS, d, (0.0, 0.0, 0.33)) + d * 0.012
        _env.star_flower(f"Blossom{k}", tuple(at), 0.065 + rnd.uniform(0, 0.015),
                         mats[k % len(mats)], normal=tuple(d), spin=rnd.uniform(0, 6.3))


def build():
    lib.begin(NAME)
    leaves = [lib.mat("Leaf", _env.P["treeLeaf"][0], rough=0.8),
              lib.mat("LeafDark", _env.P["treeLeaf"][1], rough=0.8),
              lib.mat("LeafLight", _env.P["treeLeaf"][2], rough=0.8)]
    flowers = [_env.double_sided(lib.mat(name, c, rough=0.6)) for name, c in
               (("BlossomPink", "#FF9DCB"), ("BlossomCream", "#FFF4E3"),
                ("BlossomCoral", "#FF7A6B"))]
    _env.puff_cluster("Puff", PUFFS, leaves, seed=120)
    blossoms(flowers)


META = dict(
    name="Flowering bush", category="outdoor", priority="P1",
    description="Round faceted bush dotted with pink, cream and coral blossoms",
    tags=["bush", "garden", "flowers", "foliage", "faceted"], tintable=[], anchors={},
    notes="Blossom materials are double-sided.",
)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META, strength=0.8)
