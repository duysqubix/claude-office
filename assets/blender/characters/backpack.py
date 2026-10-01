"""Backpack: a chunky rounded `Accent` backpack on the back, with a front pocket, a top flap,
a grab loop, zips and two padded straps running over the shoulders and down the chest.
Pivot at the torso origin (pelvis)."""
import math

from mathutils import Vector

from characters import _body as B
from characters import _kit as kit
from characters import _monet as mo

import lib

NAME = "backpack"
META = mo.meta("Backpack", "character-accessory", "Chunky backpack with padded straps",
               ["backpack", "intern", "school", "accessory"], priority="P1")


def build():
    lib.begin(NAME)
    body = kit.m_accent("#FFC93C", rough=0.7)
    dark = kit.flat("Trim", "#2F3E66", rough=0.6)
    zip_m = kit.flat("Zip", lib.P["metal"], rough=0.3, metal=0.4)
    p, n = B.torso_surface(0.0, 0.14, back=True)
    c = p + n * 0.09
    META["anchors_bl"] = {"pack": tuple(c)}
    b = lib.rbox("Pack", (0.3, 0.15, 0.34), tuple(c), body, r=0.06, seg=2)
    lib.subsurf(b, 1)
    lib.rbox("Pocket", (0.22, 0.06, 0.15), tuple(c + Vector((0, 0.08, -0.07))), body, r=0.035,
             seg=2)
    lib.rbox("PocketZip", (0.17, 0.008, 0.01), tuple(c + Vector((0, 0.112, -0.02))), zip_m,
             r=0.003, seg=1)
    lib.rbox("Flap", (0.27, 0.14, 0.05), tuple(c + Vector((0, 0.02, 0.165))), dark, r=0.022,
             seg=2)
    kit.tube("GrabLoop", [c + Vector((-0.04, -0.03, 0.19)), c + Vector((0, -0.03, 0.235)),
                          c + Vector((0.04, -0.03, 0.19))], 0.008, dark, ring=8)
    for s in (1, -1):
        pts = [c + Vector((s * 0.09, -0.07, 0.13))]
        for x, y, back in ((0.11, 0.3, True), (0.12, 0.33, False), (0.14, 0.24, False),
                           (0.16, 0.12, False), (0.13, 0.02, True)):
            q, m = B.torso_surface(s * x, y, back=back)
            pts.append(q + m * 0.018)
        strap = kit.tube(f"Strap{s}", kit.catmull(pts, samples=16), 0.02, dark, ring=10)
        q, m = B.torso_surface(s * 0.15, 0.17)
        lib.rbox(f"Buckle{s}", (0.03, 0.01, 0.025), tuple(q + m * 0.04), zip_m, r=0.004, seg=1)


def finalize(name):
    return mo.finalize_torso_item(name, META, ao_distance=0.06)
