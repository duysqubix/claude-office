"""Wet floor sign: a chunky yellow A-frame caution sign with a handle slot, "CAUTION" and
"WET FLOOR" in black, and the classic slipping figure with splash drops, printed on both
sides. 0.64 m tall; origin at the floor centre between the feet; one face looks -Y."""
import math

import lib
from decor import _decor as D

NAME = "wet_floor_sign"
AO_RES = 512
AO_DISTANCE = 0.05
H, BOT, TOPW, T = 0.64, 0.32, 0.22, 0.014
SPLAY = math.radians(13)
META = dict(
    name="Wet floor sign", category="decor", priority="P1",
    description="Yellow A-frame CAUTION / WET FLOOR sign with a slipping figure",
    tags=["safety", "floor", "funny"], tintable=["Accent"],
    anchors_bl={"handle": (0, 0, H - 0.04)},
)


def materials():
    return dict(
        panel=D.mat("Accent", "yellow", rough=0.45),
        ink=D.mat("Ink", "ink", rough=0.55),
        foot=D.mat("Feet", "rubber", rough=0.7),
        drop=D.mat("Drop", "sky", rough=0.4),
    )


def panel_outline():
    return D.rounded_pts([(-BOT / 2, 0.0), (BOT / 2, 0.0), (TOPW / 2, H), (-TOPW / 2, H)], 0.03,
                         steps=4)


def figure(M, y):
    """Slipping figure: falling backwards, one leg kicked up, arms flung."""
    r = 0.0095
    limbs = {
        "torso": [(-0.012, 0.37), (0.018, 0.315)],
        "legA": [(0.018, 0.315), (0.06, 0.33), (0.085, 0.37)],
        "legB": [(0.018, 0.315), (0.035, 0.27), (0.065, 0.245)],
        "armA": [(-0.006, 0.36), (-0.04, 0.395), (-0.052, 0.425)],
        "armB": [(-0.004, 0.355), (0.03, 0.385), (0.052, 0.4)],
    }
    for k, pts in limbs.items():
        D.tube(f"Fig_{k}", [(x, y, z) for x, z in pts], r, M["ink"], verts=6, caps="round")
    lib.sphere("Fig_Head", 0.02, (-0.034, y, 0.395), M["ink"], u=14, v=7, scale=(1, 0.45, 1))
    D.face("Fig_Floor", D.rrect_pts(0.17, 0.008, 0.004, steps=1), M["ink"],
           loc=(0.0, y + 0.006, 0.232), rot=D.FRONT)
    for k, (x, z, s) in enumerate(((-0.06, 0.27, 1.0), (-0.035, 0.29, 0.75), (0.1, 0.285, 0.8))):
        drop = [(0.0, 0.016 * s), (0.008 * s, 0.0), (0.0, -0.008 * s), (-0.008 * s, 0.0)]
        D.face(f"Fig_Drop{k}", D.rounded_pts(drop, 0.005 * s, steps=3), M["drop"],
               loc=(x, y + 0.006, z), rot=D.FRONT)


def side(M, sy):
    """One panel with its print, built facing -Y, then turned for the back if sy > 0."""
    before = D.snapshot()
    D.prism("Panel", panel_outline(), T, M["panel"], loc=(0, 0, 0), rot=D.FRONT, r=0.006, seg=2)
    f = -T - 0.0004
    D.face("Slot", D.rrect_pts(0.09, 0.03, 0.015), M["ink"], loc=(0, f, H - 0.055), rot=D.FRONT)
    D.text("Caution", "CAUTION", 0.042, M["ink"], loc=(0, f, H - 0.125), depth=0, res=2)
    D.face("Caution_Bar", D.rrect_pts(0.2, 0.006, 0.003, steps=1), M["ink"],
           loc=(0, f, H - 0.158), rot=D.FRONT)
    figure(M, f - 0.006)
    D.text("Wet", "WET FLOOR", 0.034, M["ink"], loc=(0, f, 0.14), depth=0, res=2)
    lib.rbox("Foot", (BOT - 0.04, 0.03, 0.014), (0, -T / 2, 0.007), M["foot"], r=0.006, seg=1)
    objs = D.since(before)
    # Lean the panel out from the hinge line at the top.
    D.turn(objs, (0, 0, H), (-SPLAY, 0, 0))
    if sy > 0:
        D.place(objs, rot=(0, 0, math.pi))


def build():
    lib.begin(NAME)
    M = materials()
    side(M, -1)
    side(M, 1)
    lib.cyl("Hinge", 0.012, TOPW - 0.03, (0, 0, H - 0.004), M["panel"], r=0.004, seg=1, verts=14,
            rot=(0, math.pi / 2, 0))
    # Splaying lifted the feet; set the whole sign back down on the floor.
    D.ground()


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META)
