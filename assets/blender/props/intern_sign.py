"""Intern sign: a scrappy standing sign. A cardboard board reading "INTERNS" in marker blue
with a little arrow, taped to a broom-handle pole that stands in a chunky orange traffic
cone. Origin at the floor centre; the lettering faces -Y (plain cardboard on the back)."""
import math

import lib

NAME = "intern_sign"
AO_RES = 256
BW, BH, BZ = 0.62, 0.32, 1.25
META = dict(
    name="Intern sign", category="decor", priority="P0",
    description="Scrappy cardboard INTERNS sign on a pole in a traffic cone",
    tags=["interns", "sign", "text"], tintable=[], anchors_bl={},
)


def materials():
    return dict(
        card=lib.mat("Cardboard", "#D9B27C", rough=0.85),
        ink=lib.mat("Marker", "#2F3E9E", rough=0.6),
        tape=lib.mat("Tape", "#B8BEC8", rough=0.5),
        pole=lib.mat("Pole", lib.P["wood"], rough=0.6),
        cone=lib.mat("Cone", "#FF7A2F", rough=0.5),
        stripe=lib.mat("Stripe", "#FFFFFF", rough=0.5),
    )


def stand(M):
    lib.rbox("ISg_ConeBase", (0.34, 0.34, 0.04), (0, 0, 0.02), M["cone"], r=0.015, seg=2)
    lib.cyl("ISg_Cone", 0.13, 0.42, (0, 0, 0.25), M["cone"], radius2=0.035, r=0.012, seg=1,
            verts=20)
    lib.cyl("ISg_Stripe", 0.095, 0.06, (0, 0, 0.27), M["stripe"], radius2=0.083, r=0, verts=20)
    lib.cyl("ISg_Pole", 0.018, BZ - 0.1, (0, 0.03, (BZ - 0.1) / 2 + 0.1), M["pole"], r=0.006,
            seg=1, verts=10)


def board(M):
    tilt = (0, math.radians(-4), 0)            # hung a little crooked
    lib.rbox("ISg_Board", (BW, 0.02, BH), (0, 0, BZ), M["card"], r=0.006, seg=1, rot=tilt)
    lib.text("ISg_Text", "INTERNS", 0.1, (0, -0.012, BZ + 0.03), M["ink"], extrude=0,
             bevel=0, res=2, rot=(math.pi / 2, math.radians(-4), 0))
    lib.slab("ISg_Arrow", [(-0.08, -0.012), (0.05, -0.012), (0.05, -0.03), (0.09, 0.0),
                           (0.05, 0.03), (0.05, 0.012), (-0.08, 0.012)], -0.002, 0.002,
             (0.05, -0.012, BZ - 0.09), M["ink"], r=0, rot=(math.pi / 2, math.radians(-4), 0))
    for i, (x, z) in enumerate(((-BW / 2 + 0.03, BH / 2 - 0.03), (BW / 2 - 0.03, BH / 2 - 0.03))):
        lib.rbox(f"ISg_Tape{i}", (0.09, 0.004, 0.03), (x, -0.012, BZ + z), M["tape"],
                 r=0.0015, seg=1, rot=(0, math.radians(35 if i else -35), 0))
    lib.rbox("ISg_PoleTape", (0.06, 0.04, 0.05), (0, 0.025, BZ - 0.05), M["tape"], r=0.006,
             seg=1)


STEPS = [stand, board]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
