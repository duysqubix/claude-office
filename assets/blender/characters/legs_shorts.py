"""Shorts: a thigh in shorts, for summer: a roomy `Pants` shorts leg flaring to a turned-up
hem, then the bare `Skin` leg down to the knee. Use it in place of char_thigh (same pivot:
the hip, hanging down -Y three.js); pair it with char_shin tinted Skin, whose ankle cuff
then reads as a sock."""
import math

import numpy as np
from mathutils import Vector

from characters import _body as B
from characters import _kit as kit

import lib

NAME = "legs_shorts"
LEN = B.L["thigh"]["len"]
R = B.L["thigh"]["r"]
HEM = 0.1
META = dict(
    name="Shorts (thigh)", category="character-outfit", priority="P1",
    description="Thigh in roomy shorts with a turned-up hem and a bare knee; pivot at the hip",
    tags=["legs", "shorts", "summer"], tintable=["Pants", "Skin"],
    anchors_bl={"knee": (0, 0, -LEN)},
)


def build():
    lib.begin(NAME)
    M = B.materials(pants="#6B7A8F")
    kit.tube("ShortsLeg", [Vector((0, 0, 0.02)), Vector((0, 0, -HEM))], [R + 0.008, R + 0.016],
             M["pants"], ring=18, cap_rings=4)
    pts = [Vector(((R + 0.017) * math.cos(a), (R + 0.017) * math.sin(a), -HEM + 0.004))
           for a in np.linspace(0, 2 * math.pi, 20, endpoint=False)]
    kit.ring_tube("Cuff", pts, 0.011, M["pants"], ring=6)
    B.capsule("Leg", LEN, R - 0.006, M["skin"], verts=16)


def finalize(name):
    return kit.finalize(name, META, ao_distance=0.05)
