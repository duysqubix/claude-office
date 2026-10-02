"""Skirt: a pleated A-line skirt flaring from the waistband over the hips to just above the
knee, wide enough at the hem for the legs to swing underneath. `Pants` (the skirt takes
the bottoms colour) with a soft waistband. Pivot at the torso origin (pelvis joint)."""
import math

import bmesh
import numpy as np
from mathutils import Vector

from characters import _body as B
from characters import _kit as kit

import lib

NAME = "legs_skirt"
TOP, HEM = B.BELT_Y + 0.02, -0.235
PLEATS = 16
META = dict(
    name="Skirt", category="character-outfit", priority="P1",
    description="Pleated A-line skirt from the waist to above the knee; pivot at the pelvis",
    tags=["skirt", "pleated", "outfit"], tintable=["Pants"],
    anchors_bl={"waist": (0, 0, TOP), "hem": (0, 0, HEM)},
)


def radius(y):
    top = float(B.torso_r(np.array([B.BELT_Y]))[0]) + B.PANTS_OFF + 0.012
    t = (TOP - y) / (TOP - HEM)
    return top + 0.07 * t ** 1.2


def build():
    lib.begin(NAME)
    M = B.materials(pants="#B983FF")
    n, rows = PLEATS * 4, 9
    bm = bmesh.new()
    rings = []
    for k in range(rows + 1):
        y = TOP + (HEM - TOP) * k / rows
        t = k / rows
        ring = []
        for i in range(n):
            a = 2 * math.pi * i / n
            pleat = 0.012 * t ** 0.8 * math.cos(PLEATS * a)
            r = radius(y) + pleat
            ring.append(bm.verts.new((r * math.cos(a), 0.92 * r * math.sin(a), y)))
        rings.append(ring)
    for ra, rb in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((ra[i], ra[j], rb[j], rb[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.normal_update()
    if sum(f.calc_center_median().x * f.normal.x + f.calc_center_median().y * f.normal.y
           for f in bm.faces) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    # Give the open hem a little thickness: an inner skin a few mm in.
    ob = lib._link("Skirt", bm, M["pants"])
    mod = ob.modifiers.new("Solidify", "SOLIDIFY")
    mod.thickness = 0.008
    mod.offset = -1.0
    r = radius(TOP)
    pts = [Vector((r * math.cos(a), 0.92 * r * math.sin(a), TOP)) for a in
           np.linspace(0, 2 * math.pi, 28, endpoint=False)]
    kit.ring_tube("Waistband", pts, 0.013, M["pants"], ring=6)


def finalize(name):
    return kit.finalize(name, META, mount="torso", ao_distance=0.06)
