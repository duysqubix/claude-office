"""Pizza box: an open delivery box with "PIZZA" printed on the front (print is tintable
`Accent`, red by default), the lid tipped back showing "ENJOY!" and a couple of grease
spots, and a pepperoni pizza inside with one slice already gone and the cheese still
stringy at the cut. 0.4 × 0.4 m; origin at the desk-contact centre; the front faces -Y."""
import math

import lib
from decor import _decor as D
from decor import _food as F

NAME = "pizza_box"
AO_RES = 512
AO_DISTANCE = 0.05
W, H, T = 0.40, 0.044, 0.006
FLOOR = 0.005
R = 0.178
GONE = (math.radians(-78), math.radians(-33))  # the eaten slice, facing the camera
META = dict(
    name="Pizza box", category="food", priority="P1",
    description="Open pizza box with a pepperoni pizza missing one slice",
    tags=["break-room", "snack", "party", "pizza"], tintable=["Accent"],
    anchors_bl={"gap": (0.07, -0.085, FLOOR + 0.012)},
)
PEPPERONI = [(0.04, 0.05), (-0.055, 0.03), (0.105, 0.035), (-0.02, 0.115), (0.06, 0.12),
             (-0.105, 0.075), (-0.115, -0.03), (-0.06, -0.085), (0.0, -0.035), (-0.02, -0.13),
             (0.125, -0.02)]
BASIL = [(0.015, 0.09, 0.5), (-0.085, -0.055, 2.1), (0.09, 0.075, 1.2)]


def materials():
    return dict(
        box=D.mat("Cardboard", "#EFDDBB", rough=0.85),
        print=D.mat("Accent", "red", rough=0.6),
        grease=D.mat("Grease", "#DFC08F", rough=0.6),
        bread=D.mat("Bread", F.DOUGH, rough=0.7),
        cheese=D.mat("Cheese", F.CHEESE, rough=0.5),
        cut=D.mat("CheeseCut", F.CHEESE_DARK, rough=0.55),
        crust=D.mat("Crust", F.CRUST, rough=0.65),
        pepperoni=D.mat("Pepperoni", F.PEPPERONI, rough=0.45),
        basil=D.mat("Basil", "leaf", rough=0.55),
    )


def box(M):
    lib.rbox("Box_Bottom", (W, W, FLOOR), (0, 0, FLOOR / 2), M["box"], r=0.002, seg=1)
    for sy in (-1, 1):
        lib.rbox(f"Box_Wall{sy}", (W, T, H), (0, sy * (W / 2 - T / 2), H / 2), M["box"],
                 r=0.0022, seg=1)
    for sx in (-1, 1):
        lib.rbox(f"Box_Side{sx}", (T, W - 2 * T, H), (sx * (W / 2 - T / 2), 0, H / 2), M["box"],
                 r=0.0022, seg=1)
    y = -W / 2 - 0.0004
    D.text("Box_Print", "PIZZA", 0.024, M["print"], loc=(0, y, H / 2), depth=0, res=2)
    for s in (-1, 1):
        D.face(f"Box_Dot{s}", D.circle_pts(0.0055, 12), M["print"],
               loc=(s * 0.058, y, H / 2), rot=D.FRONT)
    # Lid tipped back past upright; its inside (now facing us) says ENJOY!
    part = D.snapshot()
    lib.rbox("Lid", (W, W, 0.005), (0, 0, H + 0.0025), M["box"], r=0.002, seg=1)
    lib.rbox("Lid_Lip", (W - 0.01, 0.005, 0.03), (0, -W / 2 + 0.0025, H - 0.012), M["box"],
             r=0.002, seg=1)
    under = H - 0.0003
    D.text("Lid_Enjoy", "ENJOY!", 0.05, M["print"], loc=(0, 0.02, under), depth=0, res=2,
           rot=(math.pi, 0, 0))
    D.face("Lid_Heart", D.heart_pts(0.03, 28), M["print"], loc=(0, -0.045, under),
           rot=(math.pi, 0, 0))
    for i, (x, y, r) in enumerate(((-0.11, -0.06, 0.03), (0.12, 0.09, 0.022), (-0.09, 0.12, 0.016))):
        D.face(f"Lid_Grease{i}", D.circle_pts(r, 16, sx=1.15), M["grease"], loc=(x, y, under),
               rot=(math.pi, 0, 0))
    D.turn(D.since(part), (0, W / 2, H + 0.0025), (math.radians(-101), 0, 0))


def pie(M):
    a0, a1 = GONE[1], GONE[0] + 2 * math.pi
    F.pizza("Pizza", M, R, a0, a1, z=FLOOR, n=40)
    top = FLOOR + 0.011
    # Slice cuts between the remaining slices.
    step = (a1 - a0) / 7
    for k in range(1, 7):
        a = a0 + step * k
        D.face(f"Pizza_Cut{k}", D.rrect_pts(R - 0.03, 0.0026, 0.0013, steps=1), M["cut"],
               loc=(0.5 * (R - 0.03) * math.cos(a), 0.5 * (R - 0.03) * math.sin(a), top + 0.0003),
               rot=(0, 0, a))
    for i, (x, y) in enumerate(PEPPERONI):
        F.pepperoni(f"Pep{i}", M, x, y, top, r=0.02 if i % 3 else 0.022)
    for i, (x, y, yaw) in enumerate(BASIL):
        F.basil(f"Basil{i}", M, x, y, top + 0.0045, yaw)
    # Stretchy cheese where the slice was pulled away.
    for i, a in enumerate(GONE):
        d = (math.cos(a), math.sin(a))
        n = (-d[1], d[0]) if i == 0 else (d[1], -d[0])  # out of the cut, into the gap
        for j, t in enumerate((0.45, 0.75)):
            px, py = t * R * d[0], t * R * d[1]
            D.tube(f"Pizza_String{i}{j}", [(px - n[0] * 0.004, py - n[1] * 0.004, top - 0.001),
                                           (px + n[0] * 0.012, py + n[1] * 0.012, top - 0.003),
                                           (px + n[0] * 0.022, py + n[1] * 0.022, FLOOR + 0.002)],
                   0.0028, M["cheese"], verts=6, smooth=3, caps="round", radii=[1.0, 0.7, 0.9])


def build():
    lib.begin(NAME)
    M = materials()
    box(M)
    pie(M)


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META)
