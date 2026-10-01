"""Water cooler: rounded white cabinet with a dispensing nook, red/blue taps and a drip tray,
a big upside-down blue water bottle with ribs, and a paper-cup dispenser on the side.
Origin at the floor centre; taps face -Y."""
import math

import lib

NAME = "water_cooler"
AO_RES = 256
META = dict(
    name="Water cooler", category="appliance", priority="P0",
    description="Office water cooler with a big blue bottle and a cup dispenser",
    tags=["break-room", "kitchen"], tintable=[],
    anchors_bl={"tap": (0, -0.2, 0.72), "cup": (0.22, 0, 0.5)},
)


def materials():
    return dict(
        body=lib.mat("Body", "#F4F7FB", rough=0.55),
        nook=lib.mat("Nook", "#C8D0DC", rough=0.6),
        hot=lib.mat("TapHot", "#FF5A5F", rough=0.45),
        cold=lib.mat("TapCold", "#3D7CFF", rough=0.45),
        bottle=lib.mat("Bottle", "#8FD3FF", rough=0.12),
        cup=lib.mat("Cup", "#FFFFFF", rough=0.7),
    )


def cabinet(M):
    lib.rbox("WC_Body", (0.36, 0.36, 0.90), (0, 0, 0.45), M["body"], r=0.06, seg=3)
    lib.rbox("WC_Nook", (0.24, 0.03, 0.24), (0, -0.172, 0.66), M["nook"], r=0.02, seg=2)
    lib.rbox("WC_Tray", (0.20, 0.08, 0.02), (0, -0.2, 0.555), M["nook"], r=0.008, seg=1)
    for s, m in ((-1, M["cold"]), (1, M["hot"])):
        lib.cyl(f"WC_Tap{s}", 0.02, 0.06, (s * 0.06, -0.205, 0.735), m, r=0.008, seg=1,
                verts=12, rot=(math.pi / 2, 0, 0))
        lib.sphere(f"WC_TapKnob{s}", 0.022, (s * 0.06, -0.235, 0.735), m, u=12, v=6)
    lib.cyl("WC_Collar", 0.09, 0.05, (0, 0, 0.92), M["nook"], r=0.015, seg=2, verts=24)


def bottle(M):
    prof = [(0.0, 0.93), (0.05, 0.93), (0.055, 1.0), (0.13, 1.05), (0.155, 1.1), (0.16, 1.2),
            (0.16, 1.3), (0.15, 1.36), (0.11, 1.4), (0.0, 1.41)]
    lib.lathe("WC_Bottle", prof, material=M["bottle"], verts=28)
    for i, z in enumerate((1.16, 1.26)):
        lib.torus(f"WC_Rib{i}", 0.162, 0.008, (0, 0, z), M["bottle"], seg=28, ring=6)


def cups(M):
    lib.cyl("WC_CupTube", 0.042, 0.24, (0.215, 0, 0.62), M["body"], r=0.01, seg=1, verts=16)
    lib.cyl("WC_CupBottom", 0.034, 0.05, (0.215, 0, 0.48), M["cup"], radius2=0.042, r=0.004,
            seg=1, verts=16)
    lib.rbox("WC_CupBracket", (0.06, 0.04, 0.05), (0.18, 0, 0.62), M["body"], r=0.015, seg=1)


STEPS = [cabinet, bottle, cups]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
