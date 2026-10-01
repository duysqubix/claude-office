"""Torso, shirt and tie: the manager's crisp white `Shirt` with a pointed collar, a breast
pocket with a pen, a fat red tie (`Accent`) from the knot at rig attach.tieKnot down over
the belly, tucked into `Pants`. Pivot at the pelvis joint; the upper shirt, collar, pocket
and tie are node `Chest` (pivot at the chest joint)."""
import math

import numpy as np
from mathutils import Vector

from characters import _body as B
from characters import _kit as kit

import lib

NAME = "char_torso_shirt_tie"
KNOT = kit.bl(*kit.ATTACH.get("tieKnot", {}).get("at", [0.0, 0.272, 0.17]))
META = dict(
    name="Torso: shirt and tie", category="character-body", priority="P0",
    description="The manager's white shirt with collar, pocket pen and a fat red tie; node Chest",
    tags=["body", "torso", "manager", "tie", "shirt"], tintable=["Shirt", "Pants", "Accent"],
    anchors_bl={"chestJoint": (0, 0, B.CHEST_Y), "tieKnot": tuple(KNOT),
                "neck": (0, 0, kit.DIM["neckY"])},
    nodes={"Chest": "bends at the chest joint"},
)


def front(x, y, out):
    p, n = B.torso_surface(x, y)
    return p + n * out


def tie_sdf(P):
    # Kite-shaped blade lying on the shirt, from under the knot to a point over the belly.
    x, y = P[:, 0], P[:, 2]
    top, wide, tip = KNOT.z - 0.02, 0.085, 0.032
    half = np.where(y > wide, 0.022 + (0.05 - 0.022) * (top - y) / (top - wide),
                    0.05 * (y - tip) / (wide - tip))
    d2 = np.maximum(np.abs(x) - half, np.maximum(y - top, tip - y))
    r = np.array([kit.torso_radius_at(float(v)) for v in np.clip(y, -0.15, 0.4)])
    surf = -B.Z * np.sqrt(np.maximum(r * r - x * x, 0.0)) - 0.011
    dz = np.abs(P[:, 1] - surf) - 0.0055
    return kit.smax(kit.smax(d2 * 0.9, dz, 0.004), -1.0, 0.0)


def build():
    lib.begin(NAME)
    M = B.materials(shirt="#F4F6FA", accent=kit.COL["manager_tie"], pants=kit.COL["manager_pants"])
    lower, chest = B.torso(M, emblem=False)
    extra = [B.crew_collar(M)]
    # Pointed collar flaps.
    for s in (1, -1):
        c = lib.sphere(f"Collar{s}", 1.0, tuple(front(s * 0.05, 0.296, 0.004)), M["shirt"],
                       scale=(0.058, 0.02, 0.034), u=12, v=6, rot=(-0.35, 0, s * -0.55))
        extra.append(c)
    # Knot and blade.
    extra.append(lib.sphere("Knot", 1.0, tuple(KNOT + Vector((0, -0.006, 0))), M["accent"],
                            scale=(0.036, 0.026, 0.031), u=12, v=8, rot=(0.2, 0, 0)))
    lo, hi = (-0.08, -0.32, 0.0), (0.08, -0.1, 0.3)
    extra.append(kit.sdf_mesh("Tie", tie_sdf, lo, hi, M["accent"], voxel=0.0025, target=380,
                              remesh="decimate"))
    # Breast pocket with a pen, on the character-left chest.
    p, n = B.torso_surface(0.105, 0.17)
    pk = lib.rbox("Pocket", (0.075, 0.008, 0.08), tuple(p + n * 0.003), M["shirt"], r=0.004,
                  seg=2, rot=B.align_z(n))
    pk.rotation_euler = (n.to_track_quat("-Y", "Z")).to_euler()
    extra.append(pk)
    pen = lib.cyl("Pen", 0.0075, 0.06, tuple(p + n * 0.006 + Vector((0.016, 0, 0.036))),
                  kit.flat("PenBlue", "#3D7CFF", rough=0.4), r=0.003, seg=1, verts=10)
    extra.append(pen)
    for ob in extra:
        lib.node(ob, "Chest", pivot=(0, 0, B.CHEST_Y))


def finalize(name):
    return kit.finalize(name, META, mount="torso", mq_torso=False, ao_distance=0.05)
