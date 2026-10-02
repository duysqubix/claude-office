"""Torso, hoodie: a cosy `Shirt`-coloured hoodie over the bean: the hood bunched in a fat
roll behind the neck, drawstrings with metal tips, a kangaroo pocket on the belly and a
ribbed hem hanging over the `Pants` waistband. Pivot at the pelvis joint; everything above
the chest joint (hood, strings, upper body) is node `Chest`."""
import math

import numpy as np
from mathutils import Vector

from characters import _body as B
from characters import _kit as kit

import lib

NAME = "char_torso_hoodie"
META = dict(
    name="Torso: hoodie", category="character-body", priority="P0",
    description="Cosy hoodie with a bunched hood, drawstrings and a kangaroo pocket; node Chest",
    tags=["body", "torso", "hoodie", "casual"], tintable=["Shirt", "Pants"],
    anchors_bl={"chestJoint": (0, 0, B.CHEST_Y), "neck": (0, 0, kit.DIM["neckY"])},
    nodes={"Chest": "bends at the chest joint"},
)
COLOR = "#7A86FF"


def hood(P):
    # A fat crescent of fabric round the back of the neck, thickest at the back.
    ring = B.neck_ring(out=0.0)
    c = sum(ring, Vector((0, 0, 0))) / len(ring)
    d = kit.sd_torus(P, tuple(c + Vector((0, 0.03, -0.012))), 0.15, 0.04,
                     kit.rot3(math.radians(-14), 0, 0))
    back = kit.sd_ellipsoid(P, tuple(c + Vector((0, 0.15, 0.0))), (0.15, 0.07, 0.075),
                            kit.rot3(math.radians(-20), 0, 0))
    d = kit.smin(d, back, 0.04)
    # Open at the front: only the back two-thirds of the ring.
    return kit.smax(d, -(P[:, 1] - (c.y - 0.06)), 0.03)


def build():
    lib.begin(NAME)
    M = B.materials(shirt=COLOR)
    lower, chest = B.torso(M, emblem=False)
    up = [kit.sdf_mesh("Hood", hood, (-0.26, -0.15, 0.2), (0.26, 0.3, 0.45), M["shirt"],
                       voxel=0.003, target=300, remesh="decimate")]
    cord = kit.flat("Cord", "#FFFDF7", rough=0.7)
    tip = kit.flat("Aglet", "#C8D0DC", rough=0.3, metal=0.4)
    for s in (1, -1):
        a = B.torso_surface(s * 0.045, 0.305)[0] + Vector((0, -0.012, 0))
        b = B.torso_surface(s * 0.05, 0.235)[0] + Vector((0, -0.012, 0))
        c = B.torso_surface(s * 0.056, 0.17)[0] + Vector((0, -0.014, 0))
        up.append(kit.tube(f"String{s}", kit.catmull([a, b, c], 6), 0.0055, cord, ring=5,
                           cap_rings=1))
        up.append(lib.cyl(f"Aglet{s}", 0.0075, 0.02, tuple(c + Vector((0, 0, -0.008))), tip,
                          r=0.002, seg=1, verts=10))
    for ob in up:
        lib.node(ob, "Chest", pivot=(0, 0, B.CHEST_Y))
    # Ribbed hem: a snug band over the pants' waistband (stays with the hips).
    y0, y1 = B.BELT_Y - 0.03, B.BELT_Y + 0.03
    rb = float(B.torso_r(np.array([B.BELT_Y]))[0]) + B.PANTS_OFF + 0.006
    rs = float(B.torso_r(np.array([y1 + 0.012]))[0])
    band = [(rb - 0.006, y0), (rb, y0 + 0.008), (rb + 0.002, (y0 + y1) / 2), (rb, y1 - 0.006),
            (rb - 0.004, y1), (rs - 0.002, y1 + 0.012)]
    B.lathe_part("Hem", band, M["shirt"], verts=24)
    # Kangaroo pocket: a panel curving with the belly, open at both sides.
    B.surface_patch("Pocket", M["shirt"], 0.105, 0.03, 0.115, out=0.008, thick=0.012,
                    rnd=0.026, target=220)
    slit = kit.flat("PocketShadow", "#2B2D42", rough=0.9)
    for s in (1, -1):
        p, n = B.torso_surface(s * 0.092, 0.075)
        sl = lib.rbox(f"Slit{s}", (0.007, 0.012, 0.055), tuple(p + n * 0.01), slit, r=0.003,
                      seg=1)
        sl.rotation_euler = n.to_track_quat("-Y", "Z").to_euler()


def finalize(name):
    return kit.finalize(name, META, mount="torso", mq_torso=False, ao=False)
