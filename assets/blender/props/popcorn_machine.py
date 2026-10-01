"""Popcorn machine: a red movie-night popcorn cart. Rounded red cart on chunky wheels, a glass
cabinet (alpha-blended) heaped with popcorn and a kettle hanging inside, a red roof with a
yellow "POPCORN" sign and a glowing warm lamp. Front faces -Y; origin at the floor centre."""
import math
import random

import lib

NAME = "popcorn_machine"
AO_RES = 512
W, D = 0.62, 0.48
CAB_Z0, CAB_H = 0.82, 0.5
META = dict(
    name="Popcorn machine", category="appliance", priority="P2",
    description="Red popcorn cart with a glass cabinet full of popcorn",
    tags=["lounge", "movie-night", "food", "fun"], tintable=[],
    anchors_bl={"front": (0, -0.55, 0)},
)


def materials():
    return dict(
        red=lib.mat("Red", "#E63946", rough=0.45),
        yellow=lib.mat("Yellow", "#FFD93D", rough=0.45),
        dark=lib.mat("Dark", lib.P["ink"], rough=0.6),
        chrome=lib.mat("Chrome", lib.P["metal"], rough=0.25, metal=0.4),
        glass=lib.mat("Glass", "#F2FAFF", rough=0.05, alpha=0.22),
        corn=lib.mat("Popcorn", "#FFF1C1", rough=0.8),
        lamp=lib.mat("Lamp", "#FFE9A8", rough=0.4, emit="#FFD98A", strength=1.8),
    )


def cart(M):
    lib.rbox("PM_Cart", (W, D, 0.6), (0, 0, 0.5), M["red"], r=0.05, seg=3)
    lib.rbox("PM_Trim", (W + 0.01, D + 0.01, 0.04), (0, 0, 0.78), M["yellow"], r=0.018, seg=1)
    lib.rbox("PM_Door", (W - 0.16, 0.02, 0.4), (0, -D / 2 - 0.005, 0.5), M["red"], r=0.025, seg=2)
    lib.sphere("PM_Knob", 0.018, (0.14, -D / 2 - 0.02, 0.5), M["yellow"], u=10, v=5)
    for s in (-1, 1):
        lib.cyl(f"PM_Wheel{s}", 0.17, 0.06, (s * (W / 2 + 0.03), 0.04, 0.17), M["dark"], r=0.022,
                seg=2, verts=24, rot=(0, math.pi / 2, 0))
        lib.cyl(f"PM_Hub{s}", 0.06, 0.07, (s * (W / 2 + 0.035), 0.04, 0.17), M["yellow"],
                r=0.012, seg=1, verts=14, rot=(0, math.pi / 2, 0))
    lib.rbox("PM_Leg", (0.06, 0.06, 0.2), (0, -0.12, 0.1), M["dark"], r=0.02, seg=1)


def cabinet(M):
    lib.rbox("PM_Floor", (W, D, 0.03), (0, 0, CAB_Z0 + 0.015), M["chrome"], r=0.01, seg=1)
    lib.rbox("PM_Glass", (W - 0.02, D - 0.02, CAB_H), (0, 0, CAB_Z0 + CAB_H / 2), M["glass"],
             r=0.02, seg=1)
    for s in (-1, 1):
        for t in (-1, 1):
            lib.cyl(f"PM_Post{s}{t}", 0.018, CAB_H, (s * (W / 2 - 0.02), t * (D / 2 - 0.02),
                    CAB_Z0 + CAB_H / 2), M["red"], r=0, verts=10)
    rnd = random.Random(9)
    for i in range(40):
        x = rnd.uniform(-W / 2 + 0.06, W / 2 - 0.06)
        y = rnd.uniform(-D / 2 + 0.06, D / 2 - 0.06)
        h = 0.1 - (x * x + y * y) * 0.4
        lib.blob(f"PM_Corn{i}", 0.022, (x, y, CAB_Z0 + 0.03 + rnd.uniform(0, max(h, 0.02))),
                 M["corn"], levels=1, scale=(1, 0.9, 0.85),
                 rot=(rnd.random(), rnd.random(), rnd.random()))
    zk = CAB_Z0 + CAB_H - 0.14
    lib.lathe("PM_Kettle", [(0.0, -0.06), (0.08, -0.06), (0.1, 0.0), (0.1, 0.04), (0.0, 0.05)],
              (0.0, 0.0, zk), M["chrome"], verts=20)
    lib.cyl("PM_KettleRod", 0.012, 0.1, (0, 0, zk + 0.09), M["chrome"], r=0, verts=8)


def roof(M):
    zr = CAB_Z0 + CAB_H
    lib.rbox("PM_Roof", (W + 0.08, D + 0.08, 0.08), (0, 0, zr + 0.04), M["red"], r=0.035, seg=3)
    lib.rbox("PM_RoofTrim", (W + 0.09, D + 0.09, 0.025), (0, 0, zr + 0.01), M["yellow"],
             r=0.01, seg=1)
    lib.rbox("PM_SignBoard", (W - 0.04, 0.04, 0.16), (0, -0.05, zr + 0.17), M["yellow"],
             r=0.03, seg=2)
    lib.text("PM_SignText", "POPCORN", 0.075, (0, -0.073, zr + 0.17), M["red"], extrude=0,
             bevel=0, res=2)
    lib.sphere("PM_Lamp", 0.04, (0, 0.12, zr + 0.11), M["lamp"], u=14, v=7)


STEPS = [cart, cabinet, roof]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
