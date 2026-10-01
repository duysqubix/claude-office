"""Headphones on a stand: chunky over-ear headphones (tintable `Accent` band and cups, dark
cushions, cream logo dots) hanging on a turned wooden stand with a curved saddle. 0.25 m
tall; origin at the desk-contact centre; cups to the left and right, front faces -Y."""
import math

import lib
from decor import _decor as D

NAME = "headphones_stand"
AO_RES = 256
AO_DISTANCE = 0.05
ZC = 0.16  # centre of the headband arc
RB = 0.088  # headband mid radius
CUP_X, CUP_Z = 0.098, ZC - 0.06
META = dict(
    name="Headphones on a stand", category="desk-item", priority="P1",
    description="Chunky over-ear headphones hanging on a wooden desk stand",
    tags=["desk", "music", "gadget"], tintable=["Accent"],
    anchors_bl={"top": (0, 0, ZC + RB + 0.006)},
)


def materials():
    return dict(
        shell=D.mat("Accent", "coral", rough=0.45),
        cushion=D.mat("Cushion", "rubber", rough=0.7),
        wood=D.mat("Wood", "wood", rough=0.6),
        logo=D.mat("Logo", "cream", rough=0.5),
    )


def stand(M):
    D.lathe("Stand_Base", [(0.0, 0.0), (0.064, 0.0), (0.0695, 0.0035), (0.0705, 0.011),
                           (0.0655, 0.0165), (0.02, 0.018), (0.0, 0.018)], M["wood"], verts=32,
            sharp=60)
    lib.cyl("Stand_Post", 0.0105, ZC + RB - 0.025, (0, 0, (ZC + RB - 0.025) / 2 + 0.012),
            M["wood"], r=0.003, seg=1, verts=16)
    lib.arc("Stand_Saddle", RB - 0.017, RB - 0.007, math.radians(62), math.radians(118),
            -0.016, 0.016, loc=(0, 0, ZC), material=M["wood"], segs=8, r=0.004, seg=2,
            rot=(math.pi / 2, 0, 0))


def headphones(M):
    lib.arc("Band", RB - 0.007, RB + 0.007, 0.0, math.pi, -0.016, 0.016, loc=(0, 0, ZC),
            material=M["shell"], segs=28, r=0.0055, seg=2, rot=(math.pi / 2, 0, 0))
    for s in (-1, 1):
        lib.rbox(f"Yoke{s}", (0.014, 0.026, 0.032), (s * (RB + 0.002), 0, ZC - 0.012),
                 M["shell"], r=0.006, seg=2)
        lib.cyl(f"Cup{s}", 0.043, 0.034, (s * CUP_X, 0, CUP_Z), M["shell"], r=0.011, seg=2,
                verts=28, rot=(0, math.pi / 2, 0))
        lib.torus(f"Cushion{s}", 0.03, 0.0115, (s * (CUP_X - 0.02), 0, CUP_Z), M["cushion"],
                  seg=20, ring=8, rot=(0, math.pi / 2, 0))
        D.face(f"Logo{s}", D.circle_pts(0.018, 20), M["logo"],
               loc=(s * (CUP_X + 0.0172), 0, CUP_Z), rot=(0, s * math.pi / 2, 0))


def build():
    lib.begin(NAME)
    M = materials()
    stand(M)
    headphones(M)


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META)
