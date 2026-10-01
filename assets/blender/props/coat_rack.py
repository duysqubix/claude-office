"""Coat rack: wooden pole on a chunky three-foot base, ball-tipped hooks at the top, a ball
finial, and a puffy blue coat plus a red scarf hanging off it. Origin at the floor centre."""
import math

import lib

NAME = "coat_rack"
AO_RES = 256
H = 1.75
META = dict(
    name="Coat rack", category="furniture", priority="P1",
    description="Wooden coat rack with a puffy coat and scarf hanging on it",
    tags=["entrance", "decor"], tintable=[], anchors_bl={},
)


def materials():
    return dict(
        wood=lib.mat("Wood", lib.P["wood"], rough=0.6),
        ball=lib.mat("WoodLight", "#E8BE84", rough=0.55),
        coat=lib.mat("Coat", "#4D96FF", rough=0.85),
        scarf=lib.mat("Scarf", "#FF6B6B", rough=0.85),
    )


def parts(M):
    lib.cyl("CR_Pole", 0.03, H - 0.05, (0, 0, (H - 0.05) / 2 + 0.03), M["wood"], r=0.01, seg=1,
            verts=14)
    for i in range(3):
        a = math.radians(90 + i * 120)
        lib.rbox(f"CR_Foot{i}", (0.34, 0.06, 0.05), (0.15 * math.cos(a), 0.15 * math.sin(a),
                 0.03), M["wood"], r=0.022, seg=2, rot=(0, 0, a))
        lib.sphere(f"CR_Toe{i}", 0.035, (0.31 * math.cos(a), 0.31 * math.sin(a), 0.03),
                   M["ball"], u=12, v=6)
    lib.sphere("CR_Finial", 0.05, (0, 0, H + 0.01), M["ball"], u=16, v=8)
    for i in range(4):
        a = math.radians(45 + i * 90)
        d = (math.cos(a), math.sin(a))
        lib.cyl(f"CR_Hook{i}", 0.014, 0.16, (d[0] * 0.07, d[1] * 0.07, H - 0.12), M["wood"],
                r=0, verts=10, rot=(math.radians(-50) * d[1], math.radians(50) * d[0], 0))
        lib.sphere(f"CR_HookTip{i}", 0.025, (d[0] * 0.13, d[1] * 0.13, H - 0.07), M["ball"],
                   u=10, v=5)


def clothes(M):
    a = math.radians(225)
    x, y = 0.15 * math.cos(a), 0.15 * math.sin(a)
    c = lib.rbox("CR_Coat", (0.34, 0.22, 0.6), (x, y, H - 0.42), M["coat"], r=0.06, seg=1,
                 rot=(0, 0, a + math.pi / 2))
    lib.subsurf(c, 1)
    lib.rbox("CR_Collar", (0.2, 0.12, 0.08), (x * 0.8, y * 0.8, H - 0.12), M["coat"], r=0.035,
             seg=1, rot=(0, 0, a + math.pi / 2))
    b = math.radians(45)
    sx, sy = 0.12 * math.cos(b), 0.12 * math.sin(b)
    s = lib.rbox("CR_Scarf", (0.1, 0.05, 0.5), (sx, sy, H - 0.33), M["scarf"], r=0.022, seg=1,
                 rot=(0, math.radians(6), b))
    lib.subsurf(s, 1)


STEPS = [parts, clothes]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
