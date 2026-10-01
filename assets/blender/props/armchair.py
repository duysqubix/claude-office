"""Armchair: one-seat sibling of the couch. Puffy rolled arms, a marshmallow seat cushion and
a back pillow in `Seat`, little wooden feet. Front faces -Y; origin at the floor centre."""
import math

import lib

NAME = "armchair"
AO_RES = 512
META = dict(
    name="Armchair", category="furniture", priority="P1",
    description="Puffy armchair matching the couch",
    tags=["seating", "lounge", "break-room"], tintable=["Seat"],
    anchors_bl={"seat": (0, -0.05, 0.52)},
)


def materials():
    return dict(
        fabric=lib.mat("Seat", lib.P["chairs"][3], rough=0.85),
        wood=lib.mat("Wood", lib.P["wood"], rough=0.6),
    )


def body(M):
    b = lib.rbox("AC_Base", (0.78, 0.84, 0.26), (0, 0, 0.23), M["fabric"], r=0.08, seg=1)
    lib.subsurf(b, 1)
    b = lib.rbox("AC_Back", (0.78, 0.24, 0.52), (0, 0.31, 0.59), M["fabric"], r=0.09, seg=1)
    lib.subsurf(b, 1)
    for s in (-1, 1):
        a = lib.rbox(f"AC_Arm{s}", (0.24, 0.86, 0.50), (s * 0.48, 0, 0.37), M["fabric"], r=0.1,
                     seg=1)
        lib.subsurf(a, 1)
        for t in (-1, 1):
            lib.cyl(f"AC_Foot{s}{t}", 0.04, 0.10, (s * 0.3, t * 0.27, 0.05), M["wood"],
                    r=0.015, seg=1, verts=12)


def cushions(M):
    c = lib.rbox("AC_Cushion", (0.66, 0.66, 0.18), (0, -0.06, 0.44), M["fabric"], r=0.07, seg=1)
    lib.subsurf(c, 1)
    p = lib.rbox("AC_Pillow", (0.62, 0.2, 0.42), (0, 0.17, 0.69), M["fabric"], r=0.09, seg=1,
                 rot=(math.radians(-12), 0, 0))
    lib.subsurf(p, 1)


STEPS = [body, cushions]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
