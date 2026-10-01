"""Apron: a cosy `Accent` bib apron hugging the front of the bean, narrow at the bib and
flaring over the belly, with a cream front pocket, a neck strap and waist ties bowed at the
back. Pivot at the torso origin (pelvis)."""
import math

from mathutils import Vector

from characters import _body as B
from characters import _kit as kit
from characters import _monet as mo

import lib

NAME = "apron"
META = mo.meta("Apron", "character-accessory", "Bib apron with a pocket and waist ties",
               ["apron", "kitchen", "barista", "accessory"], priority="P1",
               anchors_bl={"pocket": (0.0, -0.24, 0.02)})


def build():
    lib.begin(NAME)
    cloth = kit.m_accent("#FF7A6B", rough=0.85)
    cream = kit.flat("Pocket", "#FFF6E8", rough=0.85)
    ys = [0.27 - 0.36 * k / 14 for k in range(15)]

    def half_width(y):
        if y > 0.14:
            return 0.1
        t = (0.14 - y) / 0.23
        return 0.1 + 0.11 * min(1.0, t * 1.6)
    mo.torso_patch("Apron", half_width, ys, cloth, out=0.014, nu=12, thick=0.007,
                   bulge=lambda u, v: 0.01 * v * v)
    mo.torso_patch("PocketPatch", lambda y: 0.075, [0.06 - 0.08 * k / 5 for k in range(6)], cream,
                   out=0.023, nu=6, thick=0.004)
    ring = B.neck_ring(out=0.01)
    top_l, _ = B.torso_surface(0.09, 0.27)
    top_r, _ = B.torso_surface(-0.09, 0.27)
    back = sorted([p for p in ring if p.y > -0.03], key=lambda p: -p.x)
    kit.tube("NeckStrap", [top_l + Vector((0, -0.01, 0))] + back + [top_r + Vector((0, -0.01, 0))],
             0.007, cloth, ring=8)
    waist = []
    for i in range(25):
        a = math.radians(-60 + 300 * i / 24) - math.pi / 2
        r = kit.torso_radius_at(0.03) + 0.016
        waist.append(Vector((r * math.cos(a), kit.TORSO_Z * r * math.sin(a), 0.03)))
    kit.tube("WaistTie", waist, 0.008, cloth, ring=8)
    bp, bn = B.torso_surface(0.0, 0.03, back=True)
    bc = bp + bn * 0.03
    for s in (1, -1):
        loop = lib.torus(f"Bow{s}", 0.028, 0.009, tuple(bc + Vector((s * 0.03, 0, 0.0))), cloth,
                         seg=14, ring=6, rot=(math.pi / 2, 0, 0))
        loop.scale = (1.0, 1.0, 0.6)
        kit.tube(f"Tail{s}", [bc, bc + Vector((s * 0.02, 0.01, -0.05)),
                              bc + Vector((s * 0.03, 0.012, -0.1))], 0.007, cloth, ring=8)


def finalize(name):
    return mo.finalize_torso_item(name, META, ao_distance=0.04)
