"""Round bush: a low, flat-bottomed mound of faceted low-poly puffs, darker underneath and lighter on
top (PALETTE.treeLeaf). About 1.3 m across, 0.85 m tall. Origin at the ground centre."""
import math

import lib
from environment import _env

NAME = "bush_round"
AO_RES = 512
AO_DISTANCE = 0.45
FACETED = True  # ART-REFERENCE: WL nature is flat-shaded low-poly; False = smooth puffs

# (x, y, z, radius, material, cuts). Materials: 0 Leaf, 1 LeafDark, 2 LeafLight.
PUFFS = [
    (0.0, 0.02, 0.4, 0.5, 0, 7),
    (0.42, -0.12, 0.26, 0.36, 1, 6),
    (-0.4, -0.16, 0.25, 0.35, 1, 6),
    (-0.08, -0.36, 0.22, 0.3, 1, 6),
    (0.36, 0.3, 0.27, 0.36, 1, 6),
    (-0.38, 0.28, 0.28, 0.37, 0, 6),
    (0.24, -0.2, 0.6, 0.32, 0, 6),
    (-0.22, -0.12, 0.66, 0.3, 2, 6),
    (0.02, 0.24, 0.7, 0.3, 2, 6),
]


def materials():
    return [lib.mat("Leaf", _env.P["treeLeaf"][0], rough=0.8),
            lib.mat("LeafDark", _env.P["treeLeaf"][1], rough=0.8),
            lib.mat("LeafLight", _env.P["treeLeaf"][2], rough=0.8)]


def puffs(M):
    _env.puff_cluster("Puff", PUFFS, M, seed=10, faceted=FACETED)


STEPS = [puffs]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, strength=0.65)
