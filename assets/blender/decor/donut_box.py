"""Donut box: an open bakery box (tintable `Accent`, pink by default) lined with white paper,
lid flipped back with "YUM!" inside, "DONUTS" on the front, five iced donuts with sprinkles
and one empty spot with nothing but crumbs left (someone got there first). 0.3 × 0.21 m;
origin at the desk-contact centre; the front faces -Y."""
import math
import random

import lib
from decor import _decor as D
from decor import _food as F

NAME = "donut_box"
AO_RES = 256
AO_DISTANCE = 0.04
W, DP, H, T = 0.30, 0.21, 0.058, 0.006
FLOOR = 0.0075  # top of the paper liner
META = dict(
    name="Donut box", category="food", priority="P1",
    description="Open pink bakery box of iced donuts with one already gone",
    tags=["break-room", "snack", "treat", "party"], tintable=["Accent"],
    anchors_bl={"emptySlot": (0.095, -0.048, FLOOR)},
)
# (slot x, slot y, icing, sprinkles?) — front-right slot is the empty one
DONUTS = [(-0.095, -0.048, "pink", 7), (0.0, -0.048, "choc", 7), (-0.095, 0.048, "vanilla", 7),
          (0.0, 0.048, "blue", 0), (0.095, 0.048, "pink", 6)]


def materials():
    white = D.mat("Paper", "white", rough=0.7)
    pink = D.mat("IcingPink", "#FF8FB1", rough=0.45)
    blue = D.mat("IcingBlue", "sky", rough=0.45)
    yellow = D.mat("Sprinkle", "duck", rough=0.5)
    return dict(
        box=D.mat("Accent", "pink", rough=0.7),
        paper=white, dough=D.mat("Dough", F.DOUGH, rough=0.65),
        pink=pink, choc=D.mat("IcingChoc", F.CHOC, rough=0.4),
        vanilla=D.mat("IcingVanilla", "cream", rough=0.45), blue=blue,
        sprinkles=[yellow, blue, white, pink],
    )


def box(M):
    lib.rbox("Box_Bottom", (W, DP, T), (0, 0, T / 2), M["box"], r=0.0025, seg=1)
    for sy in (-1, 1):
        lib.rbox(f"Box_Wall{sy}", (W, T, H), (0, sy * (DP / 2 - T / 2), H / 2), M["box"],
                 r=0.0025, seg=1)
    for sx in (-1, 1):
        lib.rbox(f"Box_Side{sx}", (T, DP - 2 * T, H), (sx * (W / 2 - T / 2), 0, H / 2), M["box"],
                 r=0.0025, seg=1)
    lib.rbox("Box_Liner", (W - 2 * T - 0.002, DP - 2 * T - 0.002, 0.0015), (0, 0, T + 0.00075),
             M["paper"], r=0.0006, seg=1)
    # Lid flipped back on its hinge, "YUM!" on the inside facing us.
    part = D.snapshot()
    lib.rbox("Lid", (W, DP, T), (0, 0, H + T / 2), M["box"], r=0.0025, seg=1)
    lib.rbox("Lid_Lip", (W, T, 0.02), (0, -DP / 2 + T / 2, H - 0.007), M["box"], r=0.0025, seg=1)
    D.text("Lid_Yum", "YUM!", 0.06, M["paper"], loc=(0, 0.005, H - 0.0002), depth=0, res=2,
           rot=(math.pi, 0, 0))
    D.turn(D.since(part), (0, DP / 2, H + T / 2), (math.radians(-104), 0, 0))
    # Front label.
    y = -DP / 2 - 0.0004
    D.face("Label", D.rrect_pts(0.15, 0.03, 0.012, steps=3), M["paper"], loc=(0, y, H * 0.5),
           rot=D.FRONT)
    D.text("Label_Text", "DONUTS", 0.019, M["pink"], loc=(0, y - 0.0004, H * 0.5), depth=0, res=2)


def crumbs(M):
    rnd = random.Random(5)
    x0, y0 = 0.095, -0.048
    for i in range(6):
        a, d = rnd.uniform(0, 2 * math.pi), rnd.uniform(0.004, 0.03)
        s = rnd.uniform(0.0025, 0.0045)
        lib.sphere(f"Crumb{i}", s, (x0 + d * math.cos(a), y0 + d * math.sin(a), FLOOR + s * 0.5),
                   M["dough"], scale=(1.1, 0.9, 0.75), u=6, v=4, rot=(0, 0, a))
    D.prism("Smear", D.rounded_pts([(-0.012, -0.004), (0.01, -0.007), (0.016, 0.003),
                                    (0.0, 0.009), (-0.014, 0.005)], 0.004, steps=2),
            0.0008, M["pink"], loc=(x0 - 0.008, y0 + 0.012, FLOOR), back=False)
    for i, (dx, dy, spin) in enumerate(((0.012, -0.016, 0.4), (-0.018, -0.006, 1.9))):
        F.rod(f"Lost_Spr{i}", (x0 + dx, y0 + dy, FLOOR + 0.0011), (0, 0, 1), spin,
              M["sprinkles"][i])


def build():
    lib.begin(NAME)
    M = materials()
    box(M)
    for i, (x, y, kind, n) in enumerate(DONUTS):
        F.donut(f"Donut{i}", M, kind, (x, y, FLOOR), seed=11 * i + 3, n_sprinkles=n,
                yaw=0.7 * i)
    crumbs(M)


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META)
