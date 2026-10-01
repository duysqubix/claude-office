"""Monstera: nine big glossy split leaves (cartoon cardioids with slits) on arching stems,
in a chunky rolled-rim ceramic pot. The pot is `Accent` so the game can recolour it.
About 1.4 m tall. Origin at the floor centre of the pot."""
import math

import lib
from environment import _env

NAME = "plant_monstera"
AO_RES = 512
AO_DISTANCE = 0.25

POT_H = 0.44
SOIL_Z = POT_H - 0.04
SLITS = (-1.62, -1.08, -0.56, 0.56, 1.08, 1.62)

# (yaw deg, reach from the axis, height of the leaf base, pitch deg, length, droop, material)
LEAVES = [
    (0, 0.12, 1.28, 58, 0.4, 0.2, 2),
    (137, 0.22, 1.14, 42, 0.44, 0.24, 0),
    (275, 0.24, 1.08, 36, 0.42, 0.26, 1),
    (52, 0.28, 0.96, 26, 0.46, 0.28, 0),
    (190, 0.3, 0.9, 22, 0.44, 0.3, 1),
    (330, 0.32, 0.8, 16, 0.42, 0.32, 0),
    (95, 0.34, 0.74, 12, 0.4, 0.34, 1),
    (240, 0.36, 0.68, 8, 0.38, 0.36, 0),
    (20, 0.36, 0.64, 6, 0.36, 0.36, 1),
]


def materials():
    return dict(
        pot=lib.mat("Accent", lib.P["deskAccents"][1], rough=0.45),
        foot=lib.mat("PotFoot", "#F4EDE1", rough=0.5),
        soil=lib.mat("Soil", "#6B4A32", rough=0.95),
        stem=lib.mat("Stem", "#3FA45A", rough=0.6),
        leaves=[lib.mat("Leaf", lib.P["plantLeaf"], rough=0.5),
                lib.mat("LeafDark", "#2F9A4E", rough=0.5),
                lib.mat("LeafLight", "#62D67E", rough=0.5)],
    )


def pot(M):
    # A fat belly that tucks in under a rolled rim, on a cream foot ring.
    body = [(0.0, 0.035), (0.2, 0.035), (0.245, 0.06), (0.29, 0.16), (0.305, 0.27),
            (0.295, 0.36), (0.0, 0.36)]
    lib.lathe("Pot", body, material=M["pot"], verts=40)
    rim = [(0.265, 0.34), (0.3, 0.345), (0.325, 0.37), (0.33, 0.4), (0.32, 0.43),
           (0.3, 0.44), (0.275, 0.435), (0.265, 0.4), (0.265, 0.34)]
    lib.lathe("PotRim", rim, material=M["pot"], verts=40)
    foot = [(0.0, 0.0), (0.19, 0.0), (0.215, 0.012), (0.22, 0.04), (0.0, 0.04)]
    lib.lathe("PotFoot", foot, material=M["foot"], verts=40)
    lib.cyl("Soil", 0.275, 0.03, (0, 0, SOIL_Z), M["soil"], r=0.01, seg=1, verts=40)


def leaves(M):
    for i, (yaw, reach, h, pitch, length, droop, k) in enumerate(LEAVES):
        a = math.radians(yaw)
        tip = (-math.sin(a) * reach, math.cos(a) * reach, h)
        root = (-math.sin(a) * 0.04, math.cos(a) * 0.04, SOIL_Z)
        mid = ((root[0] + tip[0]) / 2 * 0.7, (root[1] + tip[1]) / 2 * 0.7, (root[2] + h) / 2)
        # Petiole in two segments so it arches out from the pot.
        _env.tube(f"Petiole{i}a", root, mid, 0.021, 0.018, M["stem"], verts=8)
        _env.tube(f"Petiole{i}b", mid, tip, 0.018, 0.015, M["stem"], verts=8)
        _env.fan_leaf(f"Leaf{i}", tip, a, math.radians(pitch), length, M["leaves"][k],
                      slits=SLITS, slit_depth=0.52, slit_w=0.075, thick=0.03, droop=droop,
                      cup=0.12, samples=64, rings=3, roll=math.radians(8 * (1 if i % 2 else -1)))


def build():
    lib.begin(NAME)
    M = materials()
    pot(M)
    leaves(M)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE)
