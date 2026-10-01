"""Fire extinguisher: a plump glossy red extinguisher standing on the floor, with a chrome
neck, black valve head, squeeze lever and carry handle, a pressure gauge in the green, a
yellow safety pin, a black hose clipped down its side and a cream "FIRE" label. 0.53 m
tall; origin at the floor-contact centre; label faces -Y."""
import math

from mathutils import Vector

import lib
from decor import _decor as D

NAME = "fire_extinguisher"
AO_RES = 256
AO_DISTANCE = 0.05
R = 0.076
META = dict(
    name="Fire extinguisher", category="decor", priority="P1",
    description="Chunky red fire extinguisher with hose, gauge and a FIRE label",
    tags=["safety", "floor", "office"], tintable=[],
    anchors_bl={"handle": (0, 0.0, 0.5)},
)


def materials():
    return dict(
        red=D.mat("Red", "red", rough=0.3),
        black=D.mat("Black", "rubber", rough=0.55),
        chrome=D.mat("Chrome", "chrome", rough=0.25, metal=0.4),
        cream=D.mat("Label", "paper", rough=0.6),
        gauge=D.mat("GaugeFace", "paper", rough=0.4),
        green=D.mat("GaugeGreen", "#2FAF6A", rough=0.5),
        yellow=D.mat("Pin", "yellow", rough=0.45),
    )


def body(M):
    prof = [(0.0, 0.0), (0.066, 0.0), (0.073, 0.006), (R, 0.022), (R, 0.355), (0.073, 0.382),
            (0.063, 0.404), (0.046, 0.419), (0.026, 0.426), (0.0, 0.428)]
    D.lathe("Body", prof, M["red"], verts=36)
    lib.cyl("Neck", 0.021, 0.03, (0, 0, 0.433), M["chrome"], r=0.004, seg=1, verts=20)
    lib.rbox("Head", (0.07, 0.048, 0.04), (0, 0, 0.465), M["black"], r=0.012, seg=2)
    lib.rbox("Lever", (0.026, 0.13, 0.012), (0, -0.04, 0.5), M["chrome"], r=0.005, seg=2,
             rot=(math.radians(-14), 0, 0))
    lib.rbox("Handle", (0.024, 0.11, 0.01), (0, -0.035, 0.478), M["chrome"], r=0.0045, seg=2,
             rot=(math.radians(-4), 0, 0))
    # Gauge on the head's side, facing front-left.
    gy, gz = -0.024, 0.47
    lib.cyl("Gauge_Rim", 0.017, 0.012, (-0.03, gy - 0.004, gz), M["chrome"], r=0.003, seg=1,
            verts=20, rot=(math.pi / 2, 0, math.radians(-20)))
    D.face("Gauge_Face", D.circle_pts(0.0125, 18), M["gauge"], loc=(-0.032, gy - 0.0105, gz),
           rot=(math.pi / 2, 0, math.radians(-20)))
    D.band("Gauge_Arc", [(0.0105 * math.cos(a), 0.0105 * math.sin(a)) for a in
                         [math.radians(30 + 120 * k / 8) for k in range(9)]],
           [(0.0065 * math.cos(a), 0.0065 * math.sin(a)) for a in
            [math.radians(30 + 120 * k / 8) for k in range(9)]],
           M["green"], loc=(-0.0321, gy - 0.0109, gz), rot=(math.pi / 2, 0, math.radians(-20)))
    lib.torus("Pin_Ring", 0.012, 0.0028, (0.044, -0.006, 0.47), M["yellow"], seg=16, ring=6,
              rot=(math.pi / 2, 0, 0))


def hose(M):
    pts = [(0.03, 0.012, 0.462), (0.07, 0.018, 0.455), (0.092, 0.012, 0.41), (0.092, 0.0, 0.3),
           (0.086, -0.012, 0.19), (0.078, -0.028, 0.15)]
    D.tube("Hose", pts, 0.0095, M["black"], verts=10, smooth=4, caps=None)
    tip = Vector(pts[-1])
    d = (tip - Vector(pts[-2])).normalized()
    lib.cyl("Nozzle", 0.013, 0.05, tuple(tip + d * 0.02), M["black"], r=0.004, seg=1, verts=14,
            radius2=0.009, rot=d.to_track_quat("Z", "Y").to_euler())
    lib.rbox("Clip", (0.03, 0.012, 0.016), (0.074, -0.03, 0.2), M["chrome"], r=0.004, seg=1)


def label(M):
    def r_at(z):
        return R + 0.0004

    lab = D.face("Label", D.rrect_pts(0.1, 0.12, 0.012, steps=3), M["cream"],
                 loc=(0, -(R + 0.0004), 0.21), rot=D.FRONT)
    _fine(lab, 0.012)
    D.wrap_cylinder(lab, r_at, base=R + 0.0004)
    t = D.text("Label_Fire", "FIRE", 0.034, M["red"], loc=(0, -(R + 0.0008), 0.235), depth=0,
               res=2)
    D.wrap_cylinder(t, R + 0.0008)
    flame = [(0.0, 0.025), (0.016, 0.0), (0.012, -0.016), (0.0, -0.022), (-0.012, -0.016),
             (-0.016, 0.0)]
    fl = D.face("Label_Flame", D.rounded_pts(flame, 0.006, steps=3), M["red"],
                loc=(0, -(R + 0.0008), 0.18), rot=D.FRONT)
    D.wrap_cylinder(fl, R + 0.0008)


def _fine(ob, edge):
    """Split a flat face so it bends round the body without cutting into it."""
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    for _ in range(6):
        long = [e for e in bm.edges if e.calc_length() > edge]
        if not long:
            break
        bmesh.ops.subdivide_edges(bm, edges=long, cuts=1, use_grid_fill=True)
        bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3])
    bm.to_mesh(ob.data)
    bm.free()


def build():
    lib.begin(NAME)
    M = materials()
    body(M)
    hose(M)
    label(M)


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META)
