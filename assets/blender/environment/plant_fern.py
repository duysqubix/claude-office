"""Boston fern: a fountain of fifteen arching fronds of little leaflets in three greens spilling over
a chunky terracotta pot with a rolled rim. About 0.75 m tall, 1 m across. Origin at the
floor centre of the pot."""
import math

import lib
from environment import _env

NAME = "plant_fern"
AO_RES = 512
AO_DISTANCE = 0.18

SOIL_Z = 0.3


def materials():
    return dict(
        pot=lib.mat("Pot", lib.P["plantPot"], rough=0.8),
        rim=lib.mat("PotRim", "#EE9466", rough=0.75),
        soil=lib.mat("Soil", "#6B4A32", rough=0.95),
        rachis=lib.mat("Rachis", "#3E9F45", rough=0.6),
        fronds=[lib.mat("Frond", "#55BE4B", rough=0.6),
                lib.mat("FrondDark", "#3E9F45", rough=0.6),
                lib.mat("FrondLight", "#79D25E", rough=0.6)],
    )


def pot(M):
    body = [(0.0, 0.0), (0.14, 0.0), (0.16, 0.012), (0.17, 0.035), (0.2, 0.27), (0.0, 0.27)]
    lib.lathe("Pot", body, material=M["pot"], verts=36)
    rim = [(0.19, 0.25), (0.225, 0.252), (0.24, 0.27), (0.245, 0.3), (0.238, 0.325),
           (0.22, 0.335), (0.2, 0.33), (0.19, 0.31), (0.19, 0.25)]
    lib.lathe("PotRim", rim, material=M["rim"], verts=36)
    lib.cyl("Soil", 0.195, 0.02, (0, 0, SOIL_Z), M["soil"], r=0.006, seg=1, verts=32)


def fronds(M):
    golden = math.radians(137.5)
    for i in range(15):
        a = i * golden
        pitch = math.radians(64 - 3.0 * i)
        length = 0.42 + 0.1 * ((i * 5) % 4) / 3
        off = 0.02 + 0.004 * i
        base = (-math.sin(a) * off, math.cos(a) * off, SOIL_Z)
        _env.pinnate_frond(f"Frond{i}_", base, a, pitch, length, 0.32 + 0.02 * (i % 4),
                           M["rachis"], M["fronds"], pairs=8, leaflet=(0.04, 0.06),
                           width=0.034, spread=1.1, rachis_r=0.007, segs=2, fall=0.15, seed=i)


def build():
    lib.begin(NAME)
    M = materials()
    pot(M)
    fronds(M)


META = dict(
    name="Boston fern",
    category="plant",
    priority="P1",
    description=("A fountain of arching fronds of little leaflets spilling over a chunky "
                 "terracotta pot"),
    tags=["plant", "indoor", "decor", "pot"],
    tintable=[],
    anchors={},
)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META)
