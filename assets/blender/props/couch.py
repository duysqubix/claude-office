"""Couch: puffy 3-seater. Fat rolled arms, three marshmallow seat cushions and three back
pillows on a soft base, all in `Seat` (tinted by the game), on little round wooden feet.
Front faces -Y; origin at the floor centre."""
import math

import lib

NAME = "couch"
AO_RES = 512
META = dict(
    name="Couch", category="furniture", priority="P0",
    description="Puffy three-seater couch with rolled arms and marshmallow cushions",
    tags=["seating", "break-room", "lounge"], tintable=["Seat"],
    anchors_bl={"seat0": (-0.6, -0.05, 0.52), "seat1": (0, -0.05, 0.52),
                "seat2": (0.6, -0.05, 0.52)},
)


def materials():
    return dict(
        fabric=lib.mat("Seat", lib.P["chairs"][3], rough=0.85),
        wood=lib.mat("Wood", lib.P["wood"], rough=0.6),
    )


def base(M):
    b = lib.rbox("Couch_Base", (1.86, 0.84, 0.26), (0, 0, 0.23), M["fabric"], r=0.08, seg=1)
    lib.subsurf(b, 1)
    b = lib.rbox("Couch_Back", (1.86, 0.24, 0.50), (0, 0.31, 0.58), M["fabric"], r=0.09, seg=1)
    lib.subsurf(b, 1)
    for s in (-1, 1):
        a = lib.rbox(f"Couch_Arm{s}", (0.24, 0.86, 0.50), (s * 0.95, 0, 0.37), M["fabric"],
                     r=0.1, seg=1)
        lib.subsurf(a, 1)
        for t in (-1, 1):
            lib.cyl(f"Couch_Foot{s}{t}", 0.04, 0.10, (s * 0.88, t * 0.33, 0.05), M["wood"],
                    r=0.015, seg=1, verts=12)


def cushions(M):
    for i in range(3):
        x = (i - 1) * 0.6
        c = lib.rbox(f"Couch_SeatCushion{i}", (0.6, 0.66, 0.17), (x, -0.06, 0.44),
                     M["fabric"], r=0.07, seg=1)
        lib.subsurf(c, 1)
        p = lib.rbox(f"Couch_BackPillow{i}", (0.58, 0.2, 0.40), (x, 0.17, 0.68), M["fabric"],
                     r=0.09, seg=1, rot=(math.radians(-12), 0, 0))
        lib.subsurf(p, 1)


STEPS = [base, cushions]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
