"""Flower bed: a chunky round-cornered wooden border full of dark soil, a back row of fat
tulips on leafy stems and a front row of leafy mounds crowned with daisies.
1.7 × 0.9 m, flowers up to 0.6 m. Origin at the ground centre; front is -Y."""
import math

import lib
from environment import _env

NAME = "flower_bed"
AO_RES = 512
AO_DISTANCE = 0.2

W, D, H = 1.7, 0.9, 0.22
SOIL_Z = H - 0.03


def materials():
    return dict(
        wood=lib.mat("Wood", lib.P["wood"], rough=0.6),
        soil=lib.mat("Soil", _env.P["soil"], rough=0.95),
        stem=lib.mat("Stem", "#3FA45A", rough=0.6),
        leaf=lib.mat("Leaf", _env.P["treeLeaf"][1], rough=0.6),
        leaves=[lib.mat("Tuft", _env.P["treeLeaf"][0], rough=0.8),
                lib.mat("TuftDark", _env.P["treeLeaf"][1], rough=0.8),
                lib.mat("TuftLight", _env.P["treeLeaf"][2], rough=0.8)],
        petals=[lib.mat(f"Petal{i}", c, rough=0.55) for i, c in enumerate(_env.P["flowers"])],
        centre=lib.mat("FlowerCentre", "#FFC93C", rough=0.6),
    )


def bed(M):
    _env.rr_ring("Border", (W, D, 0.22), (W - 0.16, D - 0.16, 0.15), H, (0, 0, H / 2),
                 M["wood"], seg=6, bevel=0.03, bseg=2, rot=(math.pi / 2, 0, 0))
    _env.rr_prism("Soil", W - 0.14, D - 0.14, SOIL_Z, 0.15, (0, 0, SOIL_Z / 2), M["soil"],
                  seg=6, bevel=0.02, bseg=1)


def stem_with_leaf(prefix, x, y, h, lean, M, leaf_yaw):
    top = (x + lean[0], y + lean[1], SOIL_Z + h)
    _env.tube(prefix + "Stem", (x, y, SOIL_Z - 0.02), top, 0.015, 0.012, M["stem"], verts=6)
    for k in (0, 1):
        _env.blade(f"{prefix}Leaf{k}", (x, y, SOIL_Z), leaf_yaw + k * math.pi,
                   math.radians(50), h * 0.6, 0.075, 0.014, M["leaf"], droop=0.35, segs=6)
    return top


def tulips(M, rnd):
    """Back row: chunky tulips on short stems."""
    for i in range(6):
        x = -0.6 + i * 0.24 + rnd.uniform(-0.03, 0.03)
        y = 0.2 + rnd.uniform(-0.03, 0.03)
        h = 0.26 + rnd.uniform(-0.03, 0.05)
        top = stem_with_leaf(f"T{i}", x, y, h, (rnd.uniform(-0.03, 0.03), rnd.uniform(-0.03, 0)),
                             M, rnd.uniform(-0.6, 0.6) + math.pi / 2)
        _env.tulip(f"T{i}", top, M["petals"][(i * 2) % 5], r=0.062,
                   rot=(rnd.uniform(-0.15, 0.1), rnd.uniform(-0.15, 0.15), rnd.uniform(0, 6.3)))


def clumps(M, rnd):
    """Front: leafy mounds crowned with daisies, so the soil hardly shows."""
    for j in range(4):
        x = -0.54 + j * 0.36
        y = -0.12 + 0.03 * (j % 2)
        _env.puff_cluster(f"Clump{j}_", [(x - 0.07, y, SOIL_Z + 0.05, 0.12, 1),
                                         (x + 0.07, y + 0.02, SOIL_Z + 0.06, 0.12, 0),
                                         (x, y + 0.08, SOIL_Z + 0.08, 0.1, 2)],
                          M["leaves"], seed=70 + j * 3, ground=SOIL_Z)
        for k in range(3):
            a = k * 2.1 + j
            fx, fy = x + 0.09 * math.cos(a), y + 0.02 + 0.07 * math.sin(a)
            _env.flower(f"C{j}{k}", (fx, fy, SOIL_Z + 0.17 + 0.02 * (k % 2)),
                        M["petals"][(j * 3 + k + 1) % 5], M["centre"], r=0.075,
                        face=(0.45 + rnd.uniform(-0.1, 0.15), rnd.uniform(-0.3, 0.3)),
                        spin=rnd.uniform(0, 6.3))


def build():
    lib.begin(NAME)
    M = materials()
    rnd = _env.rng(21)
    bed(M)
    tulips(M, rnd)
    clumps(M, rnd)


META = dict(
    name="Flower bed",
    category="outdoor",
    priority="P0",
    description=("Chunky wooden raised bed: fat tulips on leafy stems at the back, leafy mounds "
                 "crowned with daisies in front"),
    tags=["garden", "flowers", "planter"],
    tintable=[],
    anchors={},
)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META)
