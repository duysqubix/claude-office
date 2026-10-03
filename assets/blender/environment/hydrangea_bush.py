"""Hydrangea: a round faceted bush of deep green puffs crowned with big mophead blooms in
blue, lilac, periwinkle and pink, each a lumpy faceted ball half-sunk into the leaves. About
1.2 m across, 0.8 m tall. Origin at the ground centre."""
import math

from mathutils import Vector

import lib
from environment import _env

NAME = "hydrangea_bush"
AO_RES = 256
AO_DISTANCE = 0.35

# (x, y, z, radius, material). Materials: 0 Leaf, 1 LeafDark.
PUFFS = [(0.0, 0.0, 0.36, 0.42, 0), (0.33, -0.08, 0.24, 0.28, 1), (-0.32, -0.1, 0.24, 0.28, 1),
         (0.02, 0.3, 0.25, 0.28, 1), (-0.05, -0.3, 0.22, 0.26, 1)]
BLOOM_COLOURS = ("#7DA7F0", "#B9A3EE", "#9DB4F5", "#F4A7C8")


def build():
    lib.begin(NAME)
    leaves = [lib.mat("Leaf", "#3FA85A", rough=0.8), lib.mat("LeafDark", "#33914C", rough=0.8)]
    blooms = [lib.mat(f"Bloom{i}", c, rough=0.75) for i, c in enumerate(BLOOM_COLOURS)]
    _env.puff_cluster("Puff", PUFFS, leaves, seed=140)
    for k in range(6):
        up = 0.18 + 0.6 * (k % 3) / 2
        a = k * 2.39996 + 0.4
        d = Vector((math.cos(a) * math.sqrt(1 - up * up), math.sin(a) * math.sqrt(1 - up * up),
                    up))
        at = _env.puff_surface(PUFFS, d, (0.0, 0.0, 0.3)) - d.normalized() * 0.03
        _env.icoblob(f"Bloom{k}", 0.135 + 0.015 * (k % 2), tuple(at), blooms[k % 4],
                     scale=(1, 1, 0.88), subdiv=2, lump=0.18, seed=k + 60)


META = dict(
    name="Hydrangea", category="outdoor", priority="P1",
    description="Round faceted bush crowned with big blue, lilac and pink mophead blooms",
    tags=["bush", "garden", "flowers", "foliage", "faceted"], tintable=[], anchors={},
)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META, strength=0.8)
