"""Planter box: a long wooden trough of chunky horizontal planks with corner posts and feet,
overflowing with a faceted green hedge-top and a sprinkle of flowers. 1.2 × 0.45 m, about
0.75 m tall. Origin at the ground centre; front is -Y."""
import math

import lib
from environment import _env

NAME = "planter_box"
AO_RES = 512
AO_DISTANCE = 0.2

W, D, H = 1.2, 0.45, 0.42


def materials():
    return dict(
        wood=lib.mat("Wood", lib.P["wood"], rough=0.6),
        woodDark=lib.mat("WoodDark", "#A9733F", rough=0.65),
        leaves=[lib.mat("Leaf", _env.P["treeLeaf"][0], rough=0.8),
                lib.mat("LeafDark", _env.P["treeLeaf"][1], rough=0.8),
                lib.mat("LeafLight", _env.P["treeLeaf"][2], rough=0.8)],
        petals=[lib.mat(f"Petal{i}", c, rough=0.55) for i, c in enumerate(_env.P["flowers"])],
        centre=lib.mat("FlowerCentre", "#FFC93C", rough=0.6),
    )


def box(M):
    z0 = 0.06
    for k in range(3):
        z = z0 + 0.065 + k * 0.125
        for sgn in (-1, 1):
            lib.rbox(f"PlankLong{k}{sgn}", (W - 0.08, 0.04, 0.115), (0, sgn * (D / 2 - 0.02), z),
                     M["wood"], r=0.018, seg=2)
            lib.rbox(f"PlankEnd{k}{sgn}", (0.04, D - 0.08, 0.115), (sgn * (W / 2 - 0.02), 0, z),
                     M["wood"], r=0.018, seg=2)
    for sx in (-1, 1):
        for sy in (-1, 1):
            lib.rbox(f"Post{sx}{sy}", (0.08, 0.08, H + 0.03), (sx * (W / 2 - 0.02),
                     sy * (D / 2 - 0.02), (H + 0.03) / 2), M["woodDark"], r=0.022, seg=2)
    lib.rbox("Floor", (W - 0.06, D - 0.06, 0.04), (0, 0, z0 + 0.02), M["woodDark"], r=0.01,
             seg=1)


def greens(M):
    puffs = []
    for i in range(5):
        x = -0.44 + i * 0.22
        puffs.append((x, 0.02 * (i % 2), H + 0.06 + 0.03 * (i % 2), 0.2, (0, 2, 0, 2, 0)[i], 5))
    for i in range(4):
        x = -0.33 + i * 0.22
        puffs.append((x, -0.12 + 0.24 * (i % 2), H + 0.0, 0.16, 1, 5))
    _env.puff_cluster("Puff", puffs, M["leaves"], seed=100, ground=H - 0.12, faceted=True)
    rnd = _env.rng(4)
    for i in range(7):
        x = -0.48 + i * 0.16 + rnd.uniform(-0.03, 0.03)
        _env.flower(f"F{i}", (x, -0.14 + rnd.uniform(-0.03, 0.03), H + 0.17 + rnd.uniform(0, 0.05)),
                    M["petals"][i % 5], M["centre"], r=0.06,
                    face=(0.6 + rnd.uniform(-0.1, 0.1), rnd.uniform(-0.3, 0.3)),
                    spin=rnd.uniform(0, 6.3))


def build():
    lib.begin(NAME)
    M = materials()
    box(M)
    greens(M)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE)
