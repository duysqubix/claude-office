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
                       voxel=0.003, target=480, remesh="decimate")]
    up.append(B.crew_collar(M))
    cord = kit.flat("Cord", "#FFFDF7", rough=0.7)
    tip = kit.flat("Aglet", "#C8D0DC", rough=0.3, metal=0.4)
    for s in (1, -1):
        a = B.torso_surface(s * 0.045, 0.305)[0] + Vector((0, -0.012, 0))
        b = B.torso_surface(s * 0.05, 0.235)[0] + Vector((0, -0.012, 0))
        c = B.torso_surface(s * 0.056, 0.17)[0] + Vector((0, -0.014, 0))
        up.append(kit.tube(f"String{s}", kit.catmull([a, b, c], 8), 0.0055, cord, ring=6,
                           cap_rings=1))
        up.append(lib.cyl(f"Aglet{s}", 0.0075, 0.02, tuple(c + Vector((0, 0, -0.008))), tip,
                          r=0.002, seg=1, verts=10))
    for ob in up:
        lib.node(ob, "Chest", pivot=(0, 0, B.CHEST_Y))
    # Ribbed hem over the waistband (stays with the hips).
    prof = B._profile()
    hem_y = B.BELT_Y + 0.006
    r = kit.torso_radius_at(hem_y) + B.PANTS_OFF + 0.012
    pts = [Vector((r * math.cos(a), B.Z * r * math.sin(a), hem_y))
           for a in np.linspace(0, 2 * math.pi, 28, endpoint=False)]
    kit.ring_tube("Hem", pts, 0.018, M["shirt"], ring=6)
    # Kangaroo pocket: a raised panel on the belly with darker slits at the sides.
    for i, (x, w) in enumerate([(0.0, 0.2)]):
        p, n = B.torso_surface(x, 0.075)
        pk = lib.rbox("Pocket", (w, 0.012, 0.085), tuple(p + n * 0.004), M["shirt"], r=0.012,
                      seg=2)
        pk.rotation_euler = n.to_track_quat("-Y", "Z").to_euler()
    slit = kit.flat("PocketShadow", "#2B2D42", rough=0.9)
    for s in (1, -1):
        p, n = B.torso_surface(s * 0.098, 0.075)
        sl = lib.rbox(f"Slit{s}", (0.008, 0.01, 0.06), tuple(p + n * 0.007), slit, r=0.003,
                      seg=1)
        sl.rotation_euler = n.to_track_quat("-Y", "Z").to_euler()


def finalize(name):
    return kit.finalize(name, META, mount="torso", mq_torso=False, ao_distance=0.06)
