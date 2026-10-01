"""Cookie jar: a plump ceramic jar (tintable `Accent`) with a cream "COOKIES" label wrapped
round its belly and a lid knocked ajar so the cookies inside peek out. One escapee leans
against the front with a few crumbs. 0.2 m tall; origin at the desk-contact centre."""
import math
import random

from mathutils import Vector

import lib
from decor import _decor as D
from decor import _food as F

NAME = "cookie_jar"
AO_RES = 256
AO_DISTANCE = 0.04
META = dict(
    name="Cookie jar", category="food", priority="P1",
    description="Plump ceramic cookie jar with the lid ajar and a cookie escaping",
    tags=["break-room", "kitchen", "snack", "treat"], tintable=["Accent"],
    anchors_bl={"lid": (0, 0, 0.18)},
)
# Outside up to the rim, then down the inside to the cookie pile.
JAR = [(0.0, 0.0), (0.058, 0.0), (0.0645, 0.0035), (0.0705, 0.016), (0.0765, 0.04),
       (0.0785, 0.065), (0.0765, 0.095), (0.0705, 0.115), (0.061, 0.128), (0.0565, 0.134),
       (0.0565, 0.139), (0.0605, 0.1415), (0.0605, 0.1455), (0.0565, 0.1478), (0.0525, 0.146),
       (0.0505, 0.14), (0.05, 0.118), (0.0, 0.116)]
LID = [(0.0, 0.0), (0.0635, 0.0), (0.0665, 0.0035), (0.0655, 0.008), (0.0575, 0.017),
       (0.042, 0.0245), (0.022, 0.0285), (0.0, 0.0295)]
LID_Z = 0.1455


def belly_r(z):
    for (r0, z0), (r1, z1) in zip(JAR[2:9], JAR[3:10]):
        if z0 <= z <= z1:
            return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
    return 0.0785


def materials():
    return dict(
        jar=D.mat("Accent", "mint", rough=0.35),
        cream=D.mat("Cream", "cream", rough=0.5),
        ink=D.mat("LabelInk", "#7A4A2E", rough=0.6),
        cookie=D.mat("Cookie", F.COOKIE, rough=0.7),
        chip=D.mat("Chip", F.CHIP, rough=0.5),
    )


def jar(M):
    D.lathe("Jar", JAR, M["jar"], verts=36, sharp=60)
    # Label: a cream patch with brown lettering, following the belly's curve.
    z = 0.064
    r = lambda zz: belly_r(zz) + 0.0005  # noqa: E731
    lab = D.face("Label", D.rrect_pts(0.088, 0.036, 0.009, steps=3), M["cream"],
                 loc=(0, -r(z), z), rot=D.FRONT)
    F.wrap_decal(lab, r, z, max_edge=0.006)
    r2 = lambda zz: belly_r(zz) + 0.001  # noqa: E731
    t = D.text("Label_Text", "COOKIES", 0.0145, M["ink"], loc=(0, -r2(z), z), depth=0, res=2)
    F.wrap_decal(t, r2, z, max_edge=0.003)


def inside(M):
    # Cookies piled inside, one standing up where the lid gapes.
    for i, (x, y, z, rx, ry) in enumerate(((0.0, 0.0, 0.118, 0.1, 0.0), (0.012, 0.01, 0.127, -0.2, 0.15),
                                          (-0.004, -0.012, 0.135, 0.5, -0.2))):
        before = D.snapshot()
        F.cookie(f"In{i}", M, r=0.027, chips=4, seed=i)
        D.place(D.since(before), loc=(x, y, z), rot=(rx, ry, i * 1.3))
    before = D.snapshot()
    F.cookie("Peek", M, r=0.028, chips=4, seed=9)
    D.place(D.since(before), loc=(0.006, -0.03, 0.142), rot=(math.radians(72), 0, 0.2))


def lid(M):
    before = D.snapshot()
    D.lathe("Lid", [(r, z + LID_Z) for r, z in LID], M["jar"], verts=36, sharp=60)
    lib.sphere("Lid_Knob", 0.0175, (0, 0, LID_Z + 0.041), M["cream"], scale=(1, 1, 0.85), u=18, v=9)
    lib.cyl("Lid_Neck", 0.008, 0.012, (0, 0, LID_Z + 0.03), M["cream"], r=0.002, seg=1, verts=14)
    # Knocked ajar: tipped up at the front, resting on the back of the rim.
    D.turn(D.since(before), (0, 0.056, LID_Z), (math.radians(-17), 0, math.radians(4)))


def outside(M):
    before = D.snapshot()
    F.cookie("Escapee", M, r=0.03, chips=5, seed=4)
    D.place(D.since(before), loc=(0.05, -0.088, 0.0305), rot=(math.radians(70), 0, math.radians(-18)))
    rnd = random.Random(2)
    for i in range(5):
        a, d = rnd.uniform(-2.6, -0.5), rnd.uniform(0.09, 0.115)
        s = rnd.uniform(0.0025, 0.0042)
        lib.sphere(f"Crumb{i}", s, (d * math.cos(a), d * math.sin(a), s * 0.6), M["cookie"],
                   scale=(1.1, 0.9, 0.7), u=6, v=4, rot=(0, 0, a))


def build():
    lib.begin(NAME)
    M = materials()
    jar(M)
    inside(M)
    lid(M)
    outside(M)


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META)
