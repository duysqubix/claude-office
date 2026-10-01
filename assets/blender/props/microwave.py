"""Microwave: rounded cream countertop microwave with a dark glass window (with glare), a
chunky handle, and a control column with a small glowing display and two fat dials. Front
faces -Y; origin at the bottom centre."""
import math

import lib

NAME = "microwave"
AO_RES = 256
W, D, H = 0.52, 0.38, 0.31
META = dict(
    name="Microwave", category="appliance", priority="P1",
    description="Chunky cream microwave with dials and a glowing display",
    tags=["kitchen", "break-room"], tintable=[], anchors_bl={},
)


def materials():
    return dict(
        body=lib.mat("Body", "#FFF3DE", rough=0.5),
        glass=lib.mat("Window", "#2B3A4F", rough=0.15),
        glare=lib.mat("Glare", "#FFFFFF", rough=0.2),
        panel=lib.mat("Panel", lib.P["chairBase"], rough=0.55),
        display=lib.mat("Display", "#1B2330", rough=0.4, emit=lib.P["stateWorking"],
                        strength=1.2),
        dial=lib.mat("Dial", lib.P["metal"], rough=0.3, metal=0.3),
    )


def parts(M):
    lib.rbox("MW_Body", (W, D, H), (0, 0, H / 2 + 0.015), M["body"], r=0.045, seg=3)
    for s in (-1, 1):
        for t in (-1, 1):
            lib.cyl(f"MW_Foot{s}{t}", 0.018, 0.02, (s * 0.2, t * 0.14, 0.01), M["panel"],
                    r=0.006, seg=1, verts=10)
    y = -D / 2
    lib.rbox("MW_Door", (0.36, 0.02, 0.24), (-0.07, y - 0.004, H / 2 + 0.015), M["body"],
             r=0.02, seg=2)
    lib.rbox("MW_Glass", (0.26, 0.012, 0.17), (-0.09, y - 0.014, H / 2 + 0.015), M["glass"],
             r=0.012, seg=1)
    lib.rbox("MW_Glare", (0.018, 0.004, 0.12), (-0.15, y - 0.021, H / 2 + 0.02), M["glare"],
             r=0.0016, seg=1, rot=(0, math.radians(-25), 0))
    lib.rbox("MW_Handle", (0.025, 0.03, 0.18), (0.085, y - 0.025, H / 2 + 0.015), M["panel"],
             r=0.011, seg=1)
    lib.rbox("MW_Panel", (0.1, 0.012, 0.24), (0.19, y - 0.002, H / 2 + 0.015), M["panel"],
             r=0.012, seg=1)
    lib.rbox("MW_Display", (0.07, 0.006, 0.035), (0.19, y - 0.009, H - 0.04), M["display"],
             r=0.003, seg=1)
    for i, z in enumerate((0.15, 0.08)):
        lib.cyl(f"MW_Dial{i}", 0.025, 0.02, (0.19, y - 0.016, z), M["dial"], r=0.007, seg=1,
                verts=16, rot=(math.pi / 2, 0, 0))


def build():
    lib.begin(NAME)
    parts(materials())


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
