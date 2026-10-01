"""Cactus: a fat ribbed cactus with two stubby arms and a tiny pink flower on top, in a
chunky tintable `Accent` pot. 0.18 m tall; origin at the desk-contact centre."""
import math

from mathutils import Vector

import lib
from decor import _decor as D

NAME = "cactus"
AO_RES = 256
AO_DISTANCE = 0.035
META = dict(
    name="Cactus", category="plant", priority="P1",
    description="Chunky ribbed cactus with stubby arms and a pink flower, in a pot",
    tags=["desk", "plant", "clutter"], tintable=["Accent"],
    anchors_bl={"top": (0, 0, 0.18)},
)
RIBS = 8


def materials():
    return dict(
        pot=D.mat("Accent", "yellow", rough=0.5),
        soil=D.mat("Soil", "soil", rough=0.95),
        cactus=D.mat("Cactus", "#4DBB63", rough=0.6),
        petal=D.mat("Petal", "#FF7EB6", rough=0.5),
        centre=D.mat("FlowerCentre", "yellow", rough=0.5),
    )


def ribbed(ob, depth):
    """Push the surface out in RIBS soft vertical ribs."""
    def f(co):
        r = math.hypot(co.x, co.y)
        if r < 1e-6:
            return co
        a = math.atan2(co.y, co.x)
        k = 1 + depth * math.cos(RIBS * a)
        return Vector((co.x * k, co.y * k, co.z))
    return D.displace(ob, f)


def body(M, z0):
    prof = [(0.0, z0 - 0.01), (0.03, z0 - 0.01), (0.036, z0 + 0.012), (0.038, z0 + 0.05),
            (0.036, z0 + 0.075), (0.03, z0 + 0.092), (0.019, z0 + 0.103), (0.007, z0 + 0.107),
            (0.0, z0 + 0.108)]
    ribbed(D.lathe("Body", prof, M["cactus"], verts=40), 0.07)
    for name, x, z, out, up, r in (("ArmR", 1, z0 + 0.045, 0.036, 0.04, 0.0135),
                                    ("ArmL", -1, z0 + 0.03, 0.03, 0.026, 0.012)):
        pts = [(x * 0.02, 0, z), (x * (0.03 + out * 0.6), 0, z), (x * (0.032 + out), 0, z + 0.012),
               (x * (0.032 + out), 0, z + up)]
        D.tube(name, pts, r, M["cactus"], verts=12, smooth=4, caps="round")


def flower(M, top):
    for i in range(5):
        a = math.radians(90 + 72 * i)
        d = Vector((math.cos(a), math.sin(a), 0.35)).normalized()
        lib.sphere(f"Petal{i}", 1.0, tuple(top + d * 0.008), M["petal"],
                   scale=(0.0055, 0.009, 0.003), u=8, v=5, rot=d.to_track_quat("Y", "Z").to_euler())
    lib.sphere("FlowerCentre", 0.0045, tuple(top + Vector((0, 0, 0.002))), M["centre"], u=10, v=6)


def build():
    lib.begin(NAME)
    M = materials()
    zs = D.pot("Pot", 0.038, 0.048, 0.075, M["pot"], M["soil"], rim=0.009)
    body(M, zs)
    flower(M, Vector((0, 0, zs + 0.107)))


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META)
