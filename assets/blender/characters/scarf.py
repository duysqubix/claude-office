"""Scarf: a fat knitted scarf wrapped round the neck in a chunky roll with two tails hanging
down the front-left, cream stripes and a fringe at the ends. `Accent`. Pivot at the torso
origin (pelvis)."""
import math

from mathutils import Vector

from characters import _body as B
from characters import _kit as kit
from characters import _monet as mo

import lib

NAME = "scarf"
META = mo.meta("Scarf", "character-accessory", "Chunky striped knit scarf with tails",
               ["scarf", "winter", "accessory"], priority="P1")


def build():
    lib.begin(NAME)
    knit = kit.m_accent("#2EC4B6", rough=0.9)
    cream = kit.flat("Stripe", "#FFF6E8", rough=0.9)
    ring = B.neck_ring(out=0.035)
    roll = kit.ring_tube("Roll", [p + Vector((0, 0, 0.015)) for p in ring], 0.045, knit, ring=14)
    roll.data.materials.append(cream)
    for v in roll.data.vertices:
        a = math.atan2(v.co.y, v.co.x)
        v.co.z += 0.006 * math.sin(a * 9)
    for s, (x0, dx) in enumerate(((0.07, 0.02), (0.11, 0.05))):
        top = min(ring, key=lambda p: (p.y + 0.3 * abs(p.x - x0)))
        pts = [top + Vector((0, -0.02, -0.02))]
        for y in (0.22, 0.14, 0.07):
            p, n = B.torso_surface(x0 + dx * (0.22 - y) * 3, y)
            pts.append(p + n * (0.03 + 0.012 * s))
        path = kit.catmull(pts, samples=12)
        t = kit.tube(f"Tail{s}", path, 0.03, knit, ring=12, caps=True)
        t.data.materials.append(cream)
        zs = [v.co.z for v in t.data.vertices]
        for poly in t.data.polygons:
            if int((poly.center.z - min(zs)) / 0.035) % 3 == 1:
                poly.material_index = 1
        end = path[-1]
        for k in range(5):
            lib.cyl(f"Fringe{s}_{k}", 0.006, 0.04, tuple(end + Vector((-0.024 + k * 0.012,
                    -0.01, -0.03))), cream, r=0.002, seg=1, verts=6)


def finalize(name):
    return mo.finalize_torso_item(name, META, ao_distance=0.04)
