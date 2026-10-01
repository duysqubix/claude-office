"""Hedge: a 2 m section of clipped box hedge: one faceted low-poly block with softly rounded
edges and jittered facets, its facets mottled in three greens like clipped leaves, sunlit on top and darker at the foot. 2.0 × 0.8 m,
0.9 m tall. Origin at the ground centre; sections tile end to end along X at 2.0 m."""
import lib
from environment import _env

NAME = "hedge"
AO_RES = 512
AO_DISTANCE = 0.35

L, D, H = 2.0, 0.8, 0.9


def materials():
    return [lib.mat("Leaf", _env.P["treeLeaf"][0], rough=0.8),
            lib.mat("LeafDark", _env.P["treeLeaf"][1], rough=0.8),
            lib.mat("LeafLight", _env.P["treeLeaf"][2], rough=0.8)]


def body(M):
    b = _env.faceted_block("Hedge", (L, D, H), (0, 0, 0), M[0], cuts=9, power=9.0,
                           jitter=0.05, seed=4, freq=5.0)
    # Mottled facets read as clipped leaves: sunlit greens on top, mid greens on the sides,
    # a darker skirt at the foot.
    _env.mottle(b, [M[2], M[0]], (0.7, 0.3), seed=1, where=lambda p: p.normal.z > 0.72)
    _env.mottle(b, [M[0], M[1], M[2]], (0.55, 0.3, 0.15), seed=2,
                where=lambda p: p.normal.z <= 0.72 and p.center.z >= 0.25)
    _env.mottle(b, [M[1], M[0]], (0.75, 0.25), seed=3,
                where=lambda p: p.normal.z <= 0.72 and p.center.z < 0.25)


def build():
    lib.begin(NAME)
    body(materials())


META = dict(
    name="Hedge section",
    category="outdoor",
    priority="P1",
    description=("2 m section of clipped hedge: one faceted block with facets mottled in three "
                 "greens, sunlit on top"),
    tags=["hedge", "garden", "boundary", "faceted"],
    tintable=[],
    anchors={},
    notes=("Sections tile end to end along X at 2.0 m (soft rounded ends read as separate clipped "
           "bushes)."),
)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META, strength=0.8)
