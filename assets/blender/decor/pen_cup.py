"""Pen cup: a chunky tintable `Accent` cup holding a yellow pencil (pink eraser), a blue and
a red pen with clips, and orange-handled scissors, each leaning its own way. Cup 0.1 m tall,
pens up to 0.18 m; origin at the desk-contact centre."""
import math

import lib
from decor import _decor as D

NAME = "pen_cup"
AO_RES = 256
AO_DISTANCE = 0.03
META = dict(
    name="Pen cup", category="desk-item", priority="P0",
    description="Pen cup with a pencil, two pens and scissors",
    tags=["desk", "stationery", "clutter"], tintable=["Accent"],
    anchors_bl={},
)
FLOOR = 0.03  # inside floor the pens stand on


def materials():
    return dict(
        cup=D.mat("Accent", "lilac", rough=0.45),
        pencil=D.mat("Pencil", "yellow", rough=0.5),
        wood=D.mat("PencilWood", "#F2C99A", rough=0.7),
        lead=D.mat("Lead", "ink", rough=0.5),
        ferrule=D.mat("Ferrule", "chrome", rough=0.3, metal=0.4),
        eraser=D.mat("Eraser", "#FF8FB1", rough=0.7),
        blue=D.mat("PenBlue", "blue", rough=0.4),
        red=D.mat("PenRed", "red", rough=0.4),
        white=D.mat("PenBody", "white", rough=0.45),
        orange=D.mat("Handles", "orange", rough=0.45),
        steel=D.mat("Blade", "chrome", rough=0.3, metal=0.4),
    )


def cup(M):
    prof = [(0.0, 0.0), (0.035, 0.0), (0.0392, 0.0025), (0.0405, 0.009), (0.0412, 0.09),
            (0.043, 0.093), (0.0434, 0.0995), (0.0418, 0.1022), (0.0392, 0.1015),
            (0.0378, 0.098), (0.0368, 0.09), (0.0362, FLOOR), (0.0, FLOOR)]
    D.lathe("Cup", prof, M["cup"], verts=32, sharp=50)


def pencil(M):
    parts = D.snapshot()
    lib.cyl("Pencil_Body", 0.0047, 0.135, (0, 0, 0.0675), M["pencil"], r=0.0008, seg=1, verts=6)
    lib.cyl("Pencil_Ferrule", 0.0049, 0.009, (0, 0, 0.1395), M["ferrule"], r=0.001, seg=1,
            verts=12)
    lib.cyl("Pencil_Eraser", 0.0046, 0.009, (0, 0, 0.148), M["eraser"], r=0.0025, seg=2,
            verts=12)
    return D.since(parts)


def pen(M, colour):
    parts = D.snapshot()
    lib.cyl("Pen_Body", 0.0052, 0.115, (0, 0, 0.0575), M["white"], r=0.001, seg=1, verts=12)
    lib.cyl("Pen_Grip", 0.0056, 0.03, (0, 0, 0.02), M[colour], r=0.0015, seg=1, verts=12)
    lib.cyl("Pen_Cap", 0.0058, 0.04, (0, 0, 0.122), M[colour], r=0.0028, seg=2, verts=12)
    lib.rbox("Pen_Clip", (0.003, 0.0024, 0.03), (0, -0.0066, 0.12), M[colour], r=0.0011, seg=1)
    lib.sphere("Pen_Click", 0.0034, (0, 0, 0.1435), M[colour], u=10, v=6)
    return D.since(parts)


def scissors(M):
    parts = D.snapshot()
    for s in (-1, 1):
        lib.rbox(f"Sc_Blade{s}", (0.006, 0.0018, 0.07), (s * 0.002, 0, 0.04), M["steel"],
                 r=0.0008, seg=1, rot=(0, s * math.radians(4), 0))
        lib.torus(f"Sc_Loop{s}", 0.0105, 0.0042, (s * 0.0125, 0, 0.088), M["orange"], seg=16,
                  ring=8, rot=(math.pi / 2, 0, 0))
    lib.cyl("Sc_Pivot", 0.003, 0.006, (0, 0, 0.074), M["steel"], r=0.001, seg=1, verts=10,
            rot=(math.pi / 2, 0, 0))
    return D.since(parts)


def build():
    lib.begin(NAME)
    M = materials()
    cup(M)
    D.place(pencil(M), loc=(-0.012, 0.01, FLOOR), rot=(math.radians(-9), math.radians(-12), 0))
    D.place(pen(M, "blue"), loc=(0.012, 0.008, FLOOR), rot=(math.radians(-5), math.radians(11), 0.4))
    D.place(pen(M, "red"), loc=(-0.002, 0.01, FLOOR), rot=(math.radians(-11), math.radians(2), -0.3))
    D.place(scissors(M), loc=(0.006, -0.012, FLOOR), rot=(math.radians(12), math.radians(6), 0.5))


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META)
