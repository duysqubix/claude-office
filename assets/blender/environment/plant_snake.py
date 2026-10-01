"""Snake plant: eight thick, upright sword leaves in three greens, gently fanned and twisted,
in a tall cream ceramic pot with a chunky `Accent` band. About 0.95 m tall. Origin at the
floor centre of the pot."""
import math

import lib
from environment import _env

NAME = "plant_snake"
AO_RES = 512
AO_DISTANCE = 0.18

SOIL_Z = 0.33
# (yaw deg, lean from vertical deg, length, width, base offset, material)
LEAVES = [
    (0, 6, 0.62, 0.12, 0.02, 0), (70, 14, 0.52, 0.11, 0.05, 1), (140, 10, 0.58, 0.12, 0.05, 2),
    (205, 16, 0.46, 0.1, 0.06, 0), (270, 9, 0.6, 0.12, 0.05, 1), (325, 18, 0.42, 0.1, 0.07, 2),
    (105, 22, 0.36, 0.09, 0.08, 0), (240, 24, 0.34, 0.09, 0.08, 1),
]


def materials():
    return dict(
        pot=lib.mat("PotCream", "#F4EDE1", rough=0.45),
        band=lib.mat("Accent", lib.P["deskAccents"][0], rough=0.45),
        soil=lib.mat("Soil", "#6B4A32", rough=0.95),
        leaves=[lib.mat("LeafDark", "#2F8A4F", rough=0.5),
                lib.mat("Leaf", "#3FA45A", rough=0.5),
                lib.mat("LeafLight", "#6CC66B", rough=0.5)],
    )


def pot(M):
    body = [(0.0, 0.0), (0.14, 0.0), (0.158, 0.012), (0.165, 0.04), (0.168, 0.3), (0.172, 0.33),
            (0.18, 0.355), (0.172, 0.372), (0.155, 0.372), (0.15, 0.35), (0.0, 0.35)]
    lib.lathe("Pot", body, material=M["pot"], verts=36)
    band = [(0.166, 0.11), (0.176, 0.112), (0.182, 0.125), (0.182, 0.185), (0.176, 0.198),
            (0.166, 0.2)]
    lib.lathe("Band", band, material=M["band"], verts=36)
    lib.cyl("Soil", 0.152, 0.02, (0, 0, SOIL_Z), M["soil"], r=0.006, seg=1, verts=32)


def leaves(M):
    for i, (yaw, lean, length, width, off, k) in enumerate(LEAVES):
        a = math.radians(yaw)
        base = (-math.sin(a) * off, math.cos(a) * off, SOIL_Z - 0.02)
        _env.blade(f"Leaf{i}", base, a, math.radians(90 - lean), length, width, 0.03,
                   M["leaves"][k], droop=0.03, segs=8, base_w=0.45, belly=0.4,
                   roll=math.radians(25 * ((i % 3) - 1)), curl=0.012)


def build():
    lib.begin(NAME)
    M = materials()
    pot(M)
    leaves(M)


META = dict(
    name="Snake plant",
    category="plant",
    priority="P1",
    description=("Thick upright sword leaves in three greens in a tall cream ceramic pot with a "
                 "chunky coloured band"),
    tags=["plant", "indoor", "decor", "pot"],
    tintable=["Accent"],
    anchors={},
    notes="The pot band is 'Accent' (default coral #FF7A6B).",
)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META)
