"""Helpers for the desk-decor and party batch (succulent, cactus, frames, trophy, books,
binder, folder, gift box, balloons, paper plane). Underscore file: build.py skips it."""
import math

import bmesh
from mathutils import Vector

import lib
from decor import _decor as D


def leaf(name, length, width, thick, material, cup=0.6, curl=0.12, u=10, v=6, loc=(0, 0, 0),
         rot=(0, 0, 0)):
    """Plump succulent leaf: base at the origin, pointing along +Y, flat side up (+Z), round
    at the base and pointed at the tip, cupped (edges curl up) and curling up toward the
    tip."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=1.0)
    # The sphere's poles are on Z; put the leaf's length on Y.
    for vert in bm.verts:
        x, y, z = vert.co
        vert.co = Vector((x, z, y))
    for vert in bm.verts:
        x, y, z = vert.co
        t = (y + 1) / 2
        e = 0.5 + 0.55 * t * t  # round base, pointed tip
        s = max(0.0, 1 - y * y) ** e / max(1e-6, math.sqrt(max(0.0, 1 - y * y))) if abs(y) < 1 else 0
        X = x * s * width / 2
        Z = z * s * thick / 2
        Z += cup * thick * (X / (width / 2)) ** 2
        Z += curl * length * t * t
        vert.co = Vector((X, t * length, Z))
    # The y/z swap above mirrored the sphere: flip every face back to face outward.
    bmesh.ops.reverse_faces(bm, faces=bm.faces)
    return D.bm_object(name, bm, material, loc, rot)


def hollow_prism(name, outer, inner, depth, material, loc=(0, 0, 0), rot=(0, 0, 0), r=0.0,
                 seg=2):
    """Extrude the band between two matching outlines (a picture frame) from z = 0 to depth."""
    bm = bmesh.new()
    o0 = [bm.verts.new((x, y, 0.0)) for x, y in outer]
    o1 = [bm.verts.new((x, y, depth)) for x, y in outer]
    i0 = [bm.verts.new((x, y, 0.0)) for x, y in inner]
    i1 = [bm.verts.new((x, y, depth)) for x, y in inner]
    n = len(outer)
    for k in range(n):
        j = (k + 1) % n
        bm.faces.new((o1[k], o1[j], i1[j], i1[k]))  # front
        bm.faces.new((o0[j], o0[k], i0[k], i0[j]))  # back
        bm.faces.new((o0[k], o0[j], o1[j], o1[k]))  # outer side
        bm.faces.new((i0[j], i0[k], i1[k], i1[j]))  # inner side
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = D.bm_object(name, bm, material, loc, rot, sharp=35)
    if r > 0:
        lib.bevel(ob, r, seg, angle=40)
    return ob


def ribs(ob, count, depth, z0=None, z1=None):
    """Radial ribs on a lathe (cactus): r *= 1 + depth * cos(count * angle), faded out
    toward the poles and optionally limited to z0..z1."""
    for vert in ob.data.vertices:
        x, y, z = vert.co
        r = math.hypot(x, y)
        if r < 1e-6:
            continue
        if z0 is not None and (z < z0 or z > z1):
            continue
        a = math.atan2(y, x)
        k = 1 + depth * math.cos(count * a)
        vert.co.x, vert.co.y = x * k, y * k
    ob.data.update()
    return ob


def aim(direction):
    """Euler that turns local +Z to `direction`."""
    return Vector(direction).normalized().to_track_quat("Z", "Y").to_euler()
