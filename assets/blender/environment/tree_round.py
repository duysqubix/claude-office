"""Round tree: a chunky, gently leaning trunk whose foot swells into soft buttress roots, two
limbs, and a wide canopy of faceted low-poly puffs (Wobbly Life nature), darker green
underneath and lighter on top (PALETTE.treeLeaf). About 3.9 m tall, 3.3 m across. Origin at the trunk foot."""
import math

import lib
from environment import _env

NAME = "tree_round"
AO_RES = 512
AO_DISTANCE = 0.5

# Canopy puffs: (x, y, z, radius, material). Materials: 0 Leaf, 1 LeafDark, 2 LeafLight.
PUFFS = [(0.0, 0.0, 2.7, 1.2, 0)]
for _i in range(6):
    _a = math.radians(20 + _i * 60 + (_i % 2) * 9)
    PUFFS.append((0.92 * math.cos(_a), 0.92 * math.sin(_a), 2.36 + 0.07 * (_i % 3), 0.72,
                  1 if _i % 3 else 0))
for _i in range(3):
    _a = math.radians(-70 + _i * 120)
    PUFFS.append((0.48 * math.cos(_a), 0.48 * math.sin(_a), 3.25 + 0.05 * _i, 0.64, 2))
PUFFS.append((0.05, -0.05, 3.62, 0.46, 2))


def materials():
    return dict(
        trunk=lib.mat("Trunk", _env.P["treeTrunk"], rough=0.85),
        leaves=[lib.mat("Leaf", _env.P["treeLeaf"][0], rough=0.8),
                lib.mat("LeafDark", _env.P["treeLeaf"][1], rough=0.8),
                lib.mat("LeafLight", _env.P["treeLeaf"][2], rough=0.8)],
    )


def trunk(M):
    prof = [(0.0, 0.0), (0.36, 0.0), (0.355, 0.025), (0.33, 0.07), (0.3, 0.14), (0.28, 0.24),
            (0.265, 0.4), (0.255, 0.7), (0.24, 1.2), (0.22, 1.7), (0.2, 2.4), (0.0, 2.4)]
    _env.trunk("Trunk", prof, M["trunk"], verts=14, bend=(0.1, 0.04), seed=1, wobble=0.03,
               roots=5, root_amp=0.32, root_h=0.5)
    # Two limbs reaching into the canopy.
    _env.tube("LimbL", (0.0, 0.0, 1.5), (-0.6, -0.32, 2.2), 0.1, 0.07, M["trunk"], verts=10)
    _env.tube("LimbR", (0.07, 0.02, 1.7), (0.68, 0.22, 2.3), 0.095, 0.065, M["trunk"], verts=10)


def canopy(M):
    _env.puff_cluster("Puff", PUFFS, M["leaves"], seed=0, ground=-10, scale=(1, 1, 0.9))


STEPS = [trunk, canopy]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


META = dict(
    name="Round tree",
    category="outdoor",
    priority="P0",
    description=("Chunky leaning trunk with soft buttress roots under a wide canopy of faceted "
                 "low-poly puffs, darker green below and lighter on top"),
    tags=["tree", "garden", "lawn", "foliage", "faceted"],
    tintable=[],
    anchors={"canopy": [0, 2.7, 0]},
    notes="About 1.2k tris, so it is cheap to scatter.",
)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META, strength=0.8)
