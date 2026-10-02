"""Pizza slice: one chunky slice with a fat crust, melty cheese, pepperoni, a basil leaf and
a cheese string stretching off the tip. 0.2 m long; origin at the desk-contact centre; the
tip points to the front (-Y)."""
import math

import lib
from decor import _decor as D
from decor import _food as F

NAME = "pizza_slice"
AO_RES = 256
AO_DISTANCE = 0.025
R = 0.19
A0, A1 = math.radians(64), math.radians(116)
META = dict(
    name="Pizza slice", category="food", priority="P2",
    description="Single pizza slice with pepperoni, basil and a stretchy cheese tip",
    tags=["food", "snack", "party"], tintable=[],
    anchors_bl={"tip": (0, -0.1, 0.01)},
)


def materials():
    return dict(
        bread=D.mat("Bread", F.DOUGH, rough=0.7),
        cheese=D.mat("Cheese", F.CHEESE, rough=0.5),
        crust=D.mat("Crust", F.CRUST, rough=0.65),
        pepperoni=D.mat("Pepperoni", F.PEPPERONI, rough=0.45),
        basil=D.mat("Basil", "leaf", rough=0.55),
    )


def build():
    lib.begin(NAME)
    M = materials()
    before = D.snapshot()
    F.pizza("Slice", M, R, A0, A1, z=0.0, n=14)
    top = 0.011
    for i, (rr, a) in enumerate(((0.07, 90), (0.125, 78), (0.13, 103))):
        F.pepperoni(f"Pep{i}", M, rr * math.cos(math.radians(a)), rr * math.sin(math.radians(a)),
                    top, r=0.019)
    F.basil("Basil", M, 0.1 * math.cos(math.radians(97)), 0.1 * math.sin(math.radians(97)),
            top + 0.0045, 0.6)
    # A cheese string hanging off the tip.
    D.tube("Cheese_String", [(0.0, 0.012, top - 0.001), (0.0, -0.004, top - 0.002),
                             (0.002, -0.014, 0.004)], 0.003, M["cheese"], verts=6, smooth=3,
           caps="round", radii=[1.0, 0.75, 1.0])
    D.place(D.since(before), loc=(0, -0.1, 0))
    D.ground()  # the drooping cheese string must not dip below the plate


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META)
