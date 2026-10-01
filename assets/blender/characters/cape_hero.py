"""Hero cape: a swishy superhero cape hanging from a stand-up collar at the back of the neck,
flaring wide down the back in soft folds to just above the floor. `Accent` outside, gold
lining inside (solidify inner material), two gold clasp discs at the front of the neck.
Pivot at the torso origin (pelvis)."""
import math

from mathutils import Vector

from characters import _body as B
from characters import _kit as kit
from characters import _monet as mo

import lib

NAME = "cape_hero"
TOP, BOTTOM = 0.33, -0.36
META = mo.meta("Hero cape", "character-accessory", "Swishy superhero cape with a gold lining",
               ["cape", "hero", "seasonal", "fun", "accessory"], priority="P2")


def build():
    lib.begin(NAME)
    red = kit.m_accent("#E63946", rough=0.6)
    gold = kit.flat("Lining", "#FFC93C", rough=0.5)
    clasp = kit.flat("Clasp", "#F2C14E", rough=0.3, metal=0.5)
    rows, cols = 11, 14
    verts, faces = [], []
    for j in range(rows + 1):
        v = j / rows
        y = TOP + (BOTTOM - TOP) * v
        span = math.radians(70 + 45 * v)              # wraps further round as it flares
        r_body = max(kit.torso_radius_at(min(max(y, -0.14), 0.4)), 0.2)
        for i in range(cols + 1):
            u = -1 + 2 * i / cols
            a = math.pi / 2 + u * span                # around the back (+Y)
            r = r_body + 0.03 + 0.12 * v * v + 0.018 * v * math.sin(u * 7)
            verts.append(Vector((r * math.cos(a), kit.TORSO_Z * r * math.sin(a), y)))
    w = cols + 1
    for j in range(rows):
        for i in range(cols):
            a, b = j * w + i, j * w + i + 1
            faces.append((a, b, b + w, a + w))
    ob = kit.mesh_from("Cape", verts, faces, red)
    poly = ob.data.polygons[len(faces) // 2]
    if poly.normal.y < 0:
        ob.data.flip_normals()
    ob.data.materials.append(gold)
    m = ob.modifiers.new("Solidify", "SOLIDIFY")
    m.thickness = 0.01
    m.offset = -1.0
    m.material_offset = 1
    m.material_offset_rim = 1
    lib.subsurf(ob, 1)
    ring = B.neck_ring(out=0.02)
    back = sorted([p for p in ring if p.y > -0.06], key=lambda p: p.x)
    kit.tube("Collar", [p + Vector((0, 0, 0.02)) for p in back], 0.022, red, ring=10)
    for s in (1, -1):
        p = min([q for q in ring if s * q.x > 0.05], key=lambda q: q.y)
        lib.cyl(f"Clasp{s}", 0.022, 0.012, tuple(p + Vector((0, -0.012, -0.01))), clasp,
                r=0.004, seg=1, verts=16, rot=(math.pi / 2, 0, 0))


def finalize(name):
    return mo.finalize_torso_item(name, META, ao_distance=0.08)
