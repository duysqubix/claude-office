"""Hedge: a 2 m section of garden hedge, built like the bushes: a long mound of big, rounded
faceted clumps (five along the bottom, three riding on top), darker green low and lighter on
top, each clump its own shade. 2.0 × 0.85 m, about 0.95 m tall. Origin at the ground centre;
sections tile end to end along X at 2.0 m (the end clumps reach x = ±1.0)."""
import lib
from environment import _env

NAME = "hedge"
AO_RES = 512
AO_DISTANCE = 0.35

# (x, y, z, radius, material). Materials: 0 Leaf, 1 LeafDark, 2 LeafLight.
CLUMPS = [
    (-0.62, 0.07, 0.34, 0.38, 1), (-0.31, -0.07, 0.35, 0.4, 0), (0.0, 0.06, 0.34, 0.4, 1),
    (0.31, -0.06, 0.35, 0.4, 0), (0.62, 0.05, 0.34, 0.38, 1),
    (-0.42, 0.01, 0.63, 0.34, 2), (0.0, -0.03, 0.66, 0.35, 0), (0.42, 0.02, 0.63, 0.34, 2),
]


def materials():
    return [lib.mat("Leaf", _env.P["treeLeaf"][0], rough=0.8),
            lib.mat("LeafDark", _env.P["treeLeaf"][1], rough=0.8),
            lib.mat("LeafLight", _env.P["treeLeaf"][2], rough=0.8)]


def build():
    lib.begin(NAME)
    _env.puff_cluster("Clump", CLUMPS, materials(), seed=90)


META = dict(
    name="Hedge section",
    category="outdoor",
    priority="P1",
    description=("2 m section of hedge: a long mound of big rounded faceted clumps in three "
                 "greens, darker low and lighter on top"),
    tags=["hedge", "garden", "boundary", "faceted"],
    tintable=[],
    anchors={},
    notes="Sections tile end to end along X at 2.0 m; the end clumps meet and hide the seam.",
)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META, strength=0.8)
