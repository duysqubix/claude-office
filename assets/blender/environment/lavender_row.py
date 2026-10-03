"""Lavender row: five lavender plants planted in a row in a strip of dark soil, each a low
grey-green faceted mound with a fan of fat purple flower spikes on short stalks. About 1.6 m
long (along X), 0.5 m deep, 0.4 m tall. Origin at the ground centre."""
import math

import bmesh
from mathutils import Vector

import lib
from environment import _env

NAME = "lavender_row"
AO_RES = 256
AO_DISTANCE = 0.12


def spike(name, base, tip, r, material):
    """A slim purple flower spike: a four-sided bipyramid from `base` to `tip`, fattest at 35 %."""
    b, t = Vector(base), Vector(tip)
    axis = (t - b).normalized()
    side = axis.cross(Vector((0, 0, 1)))
    side = side.normalized() if side.length > 1e-6 else Vector((1, 0, 0))
    up = axis.cross(side).normalized()
    mid = b + (t - b) * 0.35
    bm = bmesh.new()
    lo, hi = bm.verts.new(tuple(b)), bm.verts.new(tuple(t))
    ring = [bm.verts.new(tuple(mid + (side * math.cos(a) + up * math.sin(a)) * r))
            for a in (k * math.pi / 2 for k in range(4))]
    for k in range(4):
        bm.faces.new((lo, ring[(k + 1) % 4], ring[k]))
        bm.faces.new((hi, ring[k], ring[(k + 1) % 4]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return lib._link(name, bm, material, smooth=False)


def build():
    lib.begin(NAME)
    soil = lib.mat("Soil", _env.P["soil"], rough=0.95)
    leaf = lib.mat("Foliage", "#8DAE86", rough=0.85)
    stalk = lib.mat("Stalk", "#7E9E70", rough=0.8)
    flower = lib.mat("Lavender", "#9A7FD1", rough=0.75)
    _env.rr_prism("Bed", 1.7, 0.5, 0.05, 0.2, (0.0, 0.0, 0.01), soil, seg=3, bevel=0.0)
    rnd = _env.rng(4)
    for p in range(5):
        x = -0.64 + p * 0.32
        y = 0.03 * (1 if p % 2 else -1)
        _env.icoblob(f"Mound{p}", 0.16, (x, y, 0.07), leaf, scale=(1.1, 1.0, 0.75), subdiv=1,
                     lump=0.1, seed=p + 70, flat=-0.3)
        for k in range(7):
            a = k * 2.39996 + p
            rr = 0.02 + 0.08 * ((k + 1) / 7) ** 0.5
            out = Vector((math.cos(a), math.sin(a), 0.0))
            base = Vector((x, y, 0.1)) + out * rr
            stem_top = base + out * 0.025 + Vector((0, 0, 0.07))
            tip = stem_top + out * (0.04 + 0.05 * rr / 0.1) + Vector((0, 0, 0.16 + rnd.uniform(0, 0.06)))
            _env.sweep_tube(f"Stalk{p}_{k}", [tuple(base), tuple(stem_top)], 0.007, stalk, verts=3,
                            caps=False)
            spike(f"Spike{p}_{k}", stem_top, tip, 0.03, flower)


META = dict(
    name="Lavender row", category="plant", priority="P1",
    description="A short planted row of lavender: grey-green mounds bristling with purple spikes",
    tags=["flowers", "garden", "border", "lavender", "faceted"], tintable=[], anchors={},
    notes="Runs along X; tile rows end to end at 1.6 m to line the trail.",
)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META, strength=0.7)
