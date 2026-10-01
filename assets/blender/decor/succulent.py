"""Succulent: a plump blue-green echeveria rosette (four rings of fat spoon leaves with
blushing pink tips) sitting proud of a chunky tintable `Accent` pot. 0.13 m tall; origin
at the desk-contact centre."""
import math

from mathutils import Vector

import lib
from decor import _decor as D

NAME = "succulent"
AO_RES = 256
AO_DISTANCE = 0.03
META = dict(
    name="Succulent", category="plant", priority="P1",
    description="Tiny echeveria rosette with blushing leaf tips in a chunky pot",
    tags=["desk", "plant", "clutter"], tintable=["Accent"],
    anchors_bl={"top": (0, 0, 0.125)},
)
# (leaves, tilt from vertical in degrees, length, yaw offset in degrees)
RINGS = [(8, 76, 0.05, 0), (7, 57, 0.045, 24), (6, 38, 0.036, 6), (4, 15, 0.027, 45)]


def materials():
    return dict(
        pot=D.mat("Accent", "lilac", rough=0.5),
        soil=D.mat("Soil", "soil", rough=0.95),
        leaf=D.mat("Leaf", "#7FCBA4", rough=0.5),
        young=D.mat("LeafYoung", "#A3DDB2", rough=0.5),
        tip=D.mat("LeafTip", "#F59AB8", rough=0.55),
    )


def rosette(M, base):
    for r, (n, tilt, length, yaw0) in enumerate(RINGS):
        t = math.radians(tilt)
        for i in range(n):
            a = math.radians(yaw0 + 360 * i / n)
            d = Vector((math.sin(t) * math.cos(a), math.sin(t) * math.sin(a), math.cos(t)))
            leaf = lib.sphere(f"Leaf{r}_{i}", 1.0, tuple(base + d * length * 0.48),
                              M["young"] if r >= 2 else M["leaf"],
                              scale=(length * 0.36, length * 0.5, length * 0.19), u=10, v=6,
                              rot=d.to_track_quat("Y", "Z").to_euler())
            if r < 3:
                # Blush the pointed end (local +Y on the unit sphere).
                D.paint(leaf, M["tip"], lambda c, n: c.y > 0.72)


def build():
    lib.begin(NAME)
    M = materials()
    zs = D.pot("Pot", 0.034, 0.043, 0.07, M["pot"], M["soil"], rim=0.008)
    rosette(M, Vector((0, 0, zs + 0.014)))


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META)
