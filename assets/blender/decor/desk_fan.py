"""Desk fan: a chunky retro fan. Tintable `Accent` base, neck and motor pod, three cream
speed buttons, a chrome cage (rim, front rings and spokes, a badge in the middle) and four
plump blades as the separate node `Blades` (pivot at the hub). The fan blows towards the
user (-Y). 0.31 m tall; origin at the desk-contact centre."""
import math

from mathutils import Vector

import lib
from decor import _decor as D

NAME = "desk_fan"
AO_RES = 256
AO_DISTANCE = 0.05
HUB = (0.0, -0.034, 0.212)
R_RIM = 0.096
META = dict(
    name="Desk fan", category="desk-item", priority="P1",
    description="Retro desk fan with a chrome cage; the blades are a separate spinning node",
    tags=["desk", "gadget", "animated"], tintable=["Accent"],
    anchors_bl={"hub": HUB},
    nodes={"Blades": "pivot at the hub; spin about the node's local Z axis in three.js "
                     "(+Z = the direction the fan blows, out of the front); Blender Y"},
)


def materials():
    return dict(
        body=D.mat("Accent", "mint", rough=0.45),
        cream=D.mat("Cream", "cream", rough=0.5),
        chrome=D.mat("Chrome", "chrome", rough=0.3, metal=0.4),
        blade=D.mat("Blade", "#FFF7EA", rough=0.45),
        badge=D.mat("Badge", "coral", rough=0.45),
    )


def base(M):
    D.lathe("Base", [(0.0, 0.0), (0.074, 0.0), (0.079, 0.004), (0.08, 0.013), (0.075, 0.021),
                     (0.06, 0.027), (0.0, 0.029)], M["body"], verts=28, sharp=60)
    for i, x in enumerate((-0.024, 0.0, 0.024)):
        lib.cyl(f"Button{i}", 0.0085, 0.008, (x, -0.06, 0.022), M["badge" if i == 0 else "cream"],
                r=0.003, seg=1, verts=14, rot=(math.radians(-35), 0, 0))
    lib.cyl("Neck", 0.015, 0.15, (0, 0.022, 0.1), M["body"], r=0.004, seg=1, verts=16)
    lib.rbox("Yoke", (0.034, 0.03, 0.032), (0, 0.024, 0.175), M["body"], r=0.011, seg=2)
    lib.sphere("Motor", 0.05, (0, 0.03, HUB[2]), M["body"], scale=(1.0, 1.1, 0.98), u=20, v=10)
    lib.cyl("Collar", 0.028, 0.02, (0, -0.016, HUB[2]), M["body"], r=0.006, seg=2, verts=20,
            rot=(math.pi / 2, 0, 0))


def cage(M):
    face_on = (math.pi / 2, 0, 0)
    hx, hy, hz = HUB
    lib.torus("Cage_Rim", R_RIM, 0.0055, (hx, hy, hz), M["chrome"], seg=28, ring=5, rot=face_on)
    for r, y in ((0.07, hy - 0.022), (0.042, hy - 0.03)):
        lib.torus(f"Cage_Ring{r}", r, 0.0022, (hx, y, hz), M["chrome"], seg=20, ring=4, rot=face_on)
    lib.torus("Cage_Back", 0.07, 0.0022, (hx, hy + 0.02, hz), M["chrome"], seg=20, ring=4,
              rot=face_on)
    for k in range(8):
        a = 2 * math.pi * (k + 0.5) / 8
        d = Vector((math.cos(a), 0, math.sin(a)))
        c = Vector(HUB)
        front = [c + Vector((0, -0.034, 0)) + d * 0.016, c + Vector((0, -0.03, 0)) + d * 0.045,
                 c + Vector((0, -0.021, 0)) + d * 0.072, c + d * R_RIM]
        D.tube(f"Cage_SpokeF{k}", front, 0.002, M["chrome"], verts=4, smooth=2, caps=None)
        back = [c + Vector((0, 0.03, 0)) + d * 0.03, c + Vector((0, 0.02, 0)) + d * 0.07,
                c + d * R_RIM]
        D.tube(f"Cage_SpokeB{k}", back, 0.002, M["chrome"], verts=4, caps=None)
    lib.cyl("Badge", 0.017, 0.006, (hx, hy - 0.036, hz), M["chrome"], r=0.003, seg=1, verts=20,
            rot=face_on)
    D.face("Badge_Dot", D.circle_pts(0.0105, 18), M["badge"], loc=(hx, hy - 0.0393, hz),
           rot=D.FRONT)


def blade_pts():
    """One plump blade outline: from the hub (x = 0) out to a round tip at x ≈ 0.084."""
    pts = []
    for i in range(9):
        t = i / 8
        x = 0.012 + t * 0.06
        w = 0.011 + 0.026 * math.sin(t * math.pi * 0.62)
        pts.append((x, -w))
    tip_c, tip_r = 0.072, 0.0215
    for i in range(1, 8):
        a = -math.pi / 2 + math.pi * i / 8
        pts.append((tip_c + tip_r * math.cos(a) * 0.9, tip_r * math.sin(a) + 0.004))
    for i in range(8, -1, -1):
        t = i / 8
        x = 0.012 + t * 0.06
        w = 0.008 + 0.019 * math.sin(t * math.pi * 0.62)
        pts.append((x, w + 0.006 * t))
    return pts


def blades(M):
    parts = []
    for k in range(4):
        before = D.snapshot()
        D.slab(f"Blade{k}", blade_pts(), 0.0032, M["blade"], r=0.0012, seg=1)
        objs = D.since(before)
        # Pitch each blade about its own long axis, lay it in the XZ plane, spin into place.
        D.place(objs, rot=(math.radians(22), 0, 0))
        D.place(objs, rot=(math.pi / 2, 0, 0))
        D.place(objs, rot=(0, math.radians(45 + 90 * k), 0))
        D.place(objs, loc=HUB)
        parts += objs
    parts.append(lib.cyl("Hub", 0.019, 0.016, HUB, M["body"], r=0.006, seg=2, verts=20,
                         rot=(math.pi / 2, 0, 0)))
    parts.append(lib.sphere("Hub_Cap", 0.0125, (HUB[0], HUB[1] - 0.008, HUB[2]), M["cream"],
                            scale=(1, 0.6, 1), u=14, v=7))
    for p in parts:
        lib.node(p, "Blades", pivot=HUB)


def build():
    lib.begin(NAME)
    M = materials()
    base(M)
    cage(M)
    blades(M)


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META)
