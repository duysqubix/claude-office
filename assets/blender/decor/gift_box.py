"""Gift box: a chunky present wrapped in tintable `Accent` paper with cream polka dots, a
gold ribbon crossing over the lid and down every side, and a big puffy bow with two tails.
0.21 m box, 0.29 m to the top of the bow; origin at the floor/desk-contact centre."""
import math

import lib
from decor import _decor as D

NAME = "gift_box"
AO_RES = 256
AO_DISTANCE = 0.04
B, BH = 0.2, 0.15
LID_H = 0.045
RIB = 0.034
META = dict(
    name="Gift box", category="decor", priority="P2",
    description="Polka-dot wrapped present with a gold ribbon and a big bow",
    tags=["party", "present", "birthday"], tintable=["Accent"],
    anchors_bl={"bow": (0, 0, 0.27)},
)
# A staggered polka grid either side of the ribbon (sparse dots in fives read as dice).
DOTS = [(u + (0.0175 if row % 2 else 0.0), 0.03 + row * 0.033)
        for row in range(4) for u in (-0.08, -0.045, 0.045, 0.08)
        if abs(u + (0.0175 if row % 2 else 0.0)) < 0.09]


def materials():
    return dict(
        wrap=D.mat("Accent", "coral", rough=0.5),
        dot=D.mat("Dots", "paper", rough=0.5),
        ribbon=D.mat("Ribbon", "gold", rough=0.35, metal=0.2),
    )


def box(M):
    lib.rbox("Box", (B, B, BH), (0, 0, BH / 2), M["wrap"], r=0.01, seg=2)
    lw, top = B + 0.014, BH + LID_H * 0.55
    lib.rbox("Lid", (lw, lw, LID_H), (0, 0, BH + LID_H * 0.05), M["wrap"], r=0.012, seg=2)
    out = B / 2 + 0.0004
    sides = (((0, -1), D.FRONT), ((0, 1), D.BACK), ((1, 0), (math.pi / 2, 0, math.pi / 2)),
             ((-1, 0), (math.pi / 2, 0, -math.pi / 2)))
    for k, ((nx, ny), rot) in enumerate(sides):
        for i, (u, z) in enumerate(DOTS):
            if abs(u) < RIB:  # under the ribbon
                continue
            loc = (nx * out, u, z * 0.95) if nx else (u, ny * out, z * 0.95)
            D.face(f"Dot{k}_{i}", D.circle_pts(0.0075, 12), M["dot"], loc=loc, rot=rot)
    # Ribbon: one band each way, over the lid and down the sides.
    for k, (sx, sy) in enumerate(((RIB, B + 0.02), (B + 0.02, RIB))):
        lib.rbox(f"Ribbon_Lid{k}", (sx if k == 0 else lw + 0.004, sy if k == 1 else lw + 0.004,
                                    LID_H + 0.004), (0, 0, BH + LID_H * 0.05), M["ribbon"],
                 r=0.006, seg=1)
        lib.rbox(f"Ribbon_Box{k}", (sx if k == 0 else B + 0.004, sy if k == 1 else B + 0.004,
                                    BH - 0.004), (0, 0, BH / 2 - 0.001), M["ribbon"], r=0.004,
                 seg=1)
    return top


def bow(M, top):
    z = BH + LID_H * 0.55 + 0.002
    for s in (-1, 1):
        loop = lib.torus(f"Bow_Loop{s}", 0.03, 0.012, (s * 0.032, 0, z + 0.024), M["ribbon"],
                         seg=20, ring=8, rot=(math.radians(90), math.radians(s * 32), 0))
        loop.scale = (1.0, 0.75, 1.0)
        D.tube(f"Bow_Tail{s}", [(s * 0.006, -0.006, z + 0.006), (s * 0.03, -0.035, z + 0.002),
                                (s * 0.05, -0.07, z - 0.012), (s * 0.06, -0.095, z - 0.03)],
               0.0075, M["ribbon"], verts=8, smooth=3, caps="round", radii=[1.0, 1.0, 0.9, 0.8])
    lib.sphere("Bow_Knot", 0.016, (0, 0, z + 0.014), M["ribbon"], u=14, v=8, scale=(1.1, 0.9, 1.0))


def build():
    lib.begin(NAME)
    M = materials()
    top = box(M)
    bow(M, top)


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META)
