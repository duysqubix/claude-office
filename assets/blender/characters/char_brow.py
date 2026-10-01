"""Brows: a pair of chunky, softly arched brows lying on the forehead, fatter in the middle
with round ends. Separate nodes `BrowL` / `BrowR` with their origin at each brow's middle
(raise = move along y, worry = rotate about z). `Hair` (rig.ts tints them a darker shade
of the hair colour). The GLB root is the head centre."""
from characters import _kit as kit

import lib

NAME = "char_brow"
META = dict(
    name="Brows", category="character-face", priority="P0",
    description="Chunky arched brows; nodes BrowL/BrowR pivot at each brow's middle",
    tags=["face", "brows"], tintable=["Hair"],
    anchors_bl={"browL": tuple(kit.brow_centre(1)), "browR": tuple(kit.brow_centre(-1))},
    nodes={"BrowL": "raise / worry", "BrowR": "raise / worry"},
)


def build():
    lib.begin(NAME)
    m = kit.m_hair("#4A3020")
    for side, node in ((1, "BrowL"), (-1, "BrowR")):
        b = kit.brow(node, side, m)
        lib.node(b, node, pivot=tuple(kit.brow_centre(side)))


def finalize(name):
    return kit.finalize(name, META, mount="head", face=("eyes", "mouth", "cheeks"), ao=False,
                        frame=kit.FACE_FRAME)
