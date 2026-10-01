"""Flipchart: chunky wooden tripod easel with a white paper pad (`Board`, planar 0..1 UVs, the
game draws on it), a top clamp bar with a couple of flipped-over pages, and a marker tray
with fat markers. The pad faces -Y; origin at the floor centre."""
import math

import bmesh
from mathutils import Euler, Vector

import lib

NAME = "flipchart"
AO_RES = 256
TILT = math.radians(-10)          # pad leans back (+Y)
PW, PH = 0.68, 0.9
PC = Vector((0, 0.0, 1.22))       # pad centre
META = dict(
    name="Flipchart", category="furniture", priority="P0",
    description="Easel flipchart with a drawable paper pad",
    tags=["team-room", "meeting-room", "board"], tintable=["Board"],
    anchors_bl={"padCenter": tuple(PC), "presenter": (0.55, -0.4, 0)},
    board=dict(width=PW, height=PH),
)


def materials():
    paper = lib.mat("Board", "#FFFFFF", rough=0.8)
    paper["no_ao"] = True
    return dict(
        wood=lib.mat("Wood", lib.P["wood"], rough=0.6),
        backer=lib.mat("Backer", "#F4F7FB", rough=0.6),
        clamp=lib.mat("Clamp", lib.P["chairBase"], rough=0.55),
        paper=paper,
        pages=lib.mat("Pages", lib.P["paper"], rough=0.8),
        red=lib.mat("MarkerRed", "#FF5A5F", rough=0.5),
        blue=lib.mat("MarkerBlue", "#3D7CFF", rough=0.5),
    )


def easel(M):
    rot = Euler((TILT, 0, 0))
    fwd = rot.to_matrix() @ Vector((0, -1, 0))
    for s in (-1, 1):
        a = Vector((s * 0.36, -0.12, 0.0))
        b = Vector((s * 0.3, 0.06, 1.72))
        d = b - a
        lib.cyl(f"FC_Leg{s}", 0.022, d.length, tuple((a + b) / 2), M["wood"], r=0.008, seg=1,
                verts=12, rot=d.to_track_quat("Z", "Y").to_euler())
    a, b = Vector((0, 0.55, 0.0)), Vector((0, 0.1, 1.5))
    d = b - a
    lib.cyl("FC_BackLeg", 0.02, d.length, tuple((a + b) / 2), M["wood"], r=0.008, seg=1,
            verts=12, rot=d.to_track_quat("Z", "Y").to_euler())
    lib.rbox("FC_Backer", (PW + 0.08, 0.03, PH + 0.1), tuple(PC + Vector((0, 0.02, 0))),
             M["backer"], r=0.02, seg=2, rot=tuple(rot))
    tray_c = PC + Vector((0, 0, -PH / 2 - 0.06)) + fwd * 0.05
    lib.rbox("FC_Tray", (PW + 0.1, 0.09, 0.025), tuple(tray_c), M["wood"], r=0.01, seg=1,
             rot=tuple(rot))
    for i, (mat, x) in enumerate(((M["red"], -0.12), (M["blue"], 0.05))):
        lib.cyl(f"FC_Marker{i}", 0.015, 0.13, tuple(tray_c + Vector((x, 0, 0.025))), mat,
                r=0.006, seg=1, verts=12, rot=(0, math.pi / 2, 0))


def pad(M):
    rot = Euler((TILT, 0, 0))
    fwd = rot.to_matrix() @ Vector((0, -1, 0))
    bm = bmesh.new()
    vs = [bm.verts.new(v) for v in ((-PW / 2, 0, -PH / 2), (PW / 2, 0, -PH / 2),
                                    (PW / 2, 0, PH / 2), (-PW / 2, 0, PH / 2))]
    bm.faces.new(vs)
    lib._link("FC_Pad", bm, M["paper"], loc=tuple(PC + fwd * 0.004), rot=tuple(rot))
    top = PC + Vector((0, 0, PH / 2 + 0.03))
    lib.rbox("FC_Clamp", (PW + 0.1, 0.06, 0.05), tuple(top + fwd * 0.01), M["clamp"], r=0.022,
             seg=2, rot=tuple(rot))
    # Two pages flipped over the top, curling down the back.
    for i in range(2):
        lib.torus(f"FC_Flip{i}", 0.05 + i * 0.012, 0.004, tuple(top + Vector((0, 0.03, 0))),
                  M["pages"], seg=10, ring=4, sweep=math.radians(150),
                  rot=(math.radians(90), 0, math.radians(-90)))


STEPS = [easel, pad]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
