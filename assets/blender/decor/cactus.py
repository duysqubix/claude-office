"""Cactus: a round, chunky ribbed cactus with two stubby arms, little cream spine dots and a
tiny pink flower on top, in a terracotta-style pot (tintable `Accent`) with a few pebbles
on the soil. 0.17 m tall; origin at the desk-contact centre."""
import math

from mathutils import Vector

import lib
from decor import _decor as D
from decor import _desk as K

NAME = "cactus"
AO_RES = 256
AO_DISTANCE = 0.025
META = dict(
    name="Cactus", category="plant", priority="P1",
    description="Chunky ribbed cactus with stubby arms and a pink flower, in a little pot",
    tags=["desk", "plant", "clutter"], tintable=["Accent"],
    anchors_bl={"top": (0, 0, 0.168)},
)
SOIL = 0.062
BODY = [(0.0, 0.0), (0.026, 0.0), (0.031, 0.005), (0.0345, 0.018), (0.0355, 0.042),
        (0.0335, 0.064), (0.028, 0.079), (0.018, 0.089), (0.007, 0.0935), (0.0, 0.0945)]


def materials():
    return dict(
        pot=D.mat("Accent", "pot", rough=0.75),
        soil=D.mat("Soil", "soil", rough=0.95),
        cactus=D.mat("Cactus", "#4DBE6A", rough=0.6),
        spine=D.mat("Spine", "#FFF7E0", rough=0.5),
        petal=D.mat("Petal", "#FF8FB1", rough=0.5),
        centre=D.mat("FlowerCentre", "yellow", rough=0.5),
        pebble=D.mat("Pebble", "#D9D4CC", rough=0.8),
    )


def pot(M):
    prof = [(0.0, 0.0), (0.031, 0.0), (0.0355, 0.003), (0.038, 0.012), (0.041, 0.052),
            (0.0455, 0.0535), (0.047, 0.058), (0.047, 0.067), (0.0448, 0.0708),
            (0.0418, 0.0712), (0.0398, 0.0685), (0.0392, SOIL + 0.002), (0.0388, SOIL),
            (0.0, SOIL)]
    p = D.lathe("Pot", prof, M["pot"], verts=28, sharp=55)
    D.paint(p, M["soil"], lambda c, n: abs(c.z - SOIL) < 0.0005 and n.z > 0.9)
    for i, (a, d, s) in enumerate(((20, 0.031, 0.006), (150, 0.03, 0.005), (250, 0.032, 0.0055),
                                   (310, 0.029, 0.0045))):
        r = math.radians(a)
        lib.sphere(f"Pebble{i}", s, (d * math.cos(r), d * math.sin(r), SOIL + s * 0.3),
                   M["pebble"], scale=(1.2, 1, 0.6), u=8, v=4)


def body(M):
    b = D.lathe("Body", [(r, z + SOIL - 0.004) for r, z in BODY], M["cactus"], verts=32)
    K.ribs(b, 8, 0.075)
    # Two stubby arms: out, then up, with round tips.
    for name, side, z0, out, up, y in (("ArmR", 1, 0.034, 0.024, 0.032, 0.0),
                                       ("ArmL", -1, 0.026, 0.021, 0.022, 0.004)):
        x0 = side * 0.022
        pts = [(x0, y, SOIL + z0), (side * (0.032 + out * 0.5), y, SOIL + z0 + 0.002),
               (side * (0.03 + out), y, SOIL + z0 + 0.012), (side * (0.03 + out), y, SOIL + z0 + up)]
        D.tube(name, pts, 0.0118, M["cactus"], verts=12, smooth=3, caps="round")
    # Spine dots on the rib crests.
    for i in range(8):
        a = 2 * math.pi * i / 8
        for j, z in enumerate((0.028, 0.058) if i % 2 else (0.043, 0.072)):
            prof_r = _radius_at(z) * 1.075
            p = Vector((prof_r * math.cos(a), prof_r * math.sin(a), SOIL - 0.004 + z))
            lib.sphere(f"Spine{i}_{j}", 0.0018, tuple(p), M["spine"], u=6, v=3)


def _radius_at(z):
    for (r0, z0), (r1, z1) in zip(BODY, BODY[1:]):
        if z0 <= z <= z1:
            return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
    return 0.0


def flower(M):
    top = SOIL - 0.004 + BODY[-1][1]
    for i in range(5):
        a = 2 * math.pi * i / 5 + 0.3
        # Petal points outward (local +Y → angle a) and tilts up 25°.
        lib.sphere(f"Petal{i}", 0.0072, (0.0068 * math.cos(a), 0.0068 * math.sin(a), top + 0.004),
                   M["petal"], scale=(0.6, 1.0, 0.35), u=10, v=5,
                   rot=(math.radians(25), 0, a - math.pi / 2))
    lib.sphere("FlowerCentre", 0.0042, (0, 0, top + 0.0055), M["centre"], u=10, v=5,
               scale=(1, 1, 0.7))


def build():
    lib.begin(NAME)
    M = materials()
    pot(M)
    body(M)
    flower(M)


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META)
