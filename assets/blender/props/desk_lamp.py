"""Desk lamp: chunky anglepoise. Round base, two fat arm segments with ball joints, a coral
bell head with a glowing `Bulb` disc inside. The head points forward-down toward -Y.
Origin at the bottom centre of the base."""
import math

from mathutils import Vector

import lib

NAME = "desk_lamp"
AO_RES = 256
META = dict(
    name="Desk lamp", category="desk-item", priority="P1",
    description="Chunky coral anglepoise desk lamp with a glowing bulb",
    tags=["desk", "lighting"], tintable=["Accent"], anchors_bl={"light": (0, -0.2, 0.3)},
)


def materials():
    return dict(
        body=lib.mat("Accent", "#FF7A6B", rough=0.45),
        joint=lib.mat("Joint", lib.P["ink"], rough=0.5),
        bulb=lib.mat("Bulb", "#FFF4C2", rough=0.4, emit="#FFE58A", strength=2.5),
    )


def segment(name, a, b, radius, mat):
    a, b = Vector(a), Vector(b)
    d = b - a
    lib.cyl(name, radius, d.length, tuple((a + b) / 2), mat, r=radius * 0.4, seg=1, verts=14,
            rot=d.to_track_quat("Z", "Y").to_euler())


def parts(M):
    lib.cyl("DL_Base", 0.09, 0.035, (0, 0.04, 0.0175), M["body"], r=0.014, seg=2, verts=24)
    p0, p1, p2 = (0, 0.04, 0.04), (0, 0.1, 0.27), (0, -0.08, 0.4)
    segment("DL_Arm1", p0, p1, 0.016, M["body"])
    segment("DL_Arm2", p1, p2, 0.016, M["body"])
    for i, p in enumerate((p0, p1, p2)):
        lib.sphere(f"DL_Joint{i}", 0.026, p, M["joint"], u=12, v=6)
    # Bell head pointing forward-down (-Y, -Z).
    aim = Vector((0, -0.6, -0.8)).normalized()
    head_c = Vector(p2) + aim * 0.06
    rot = (-aim).to_track_quat("Z", "Y").to_euler()
    prof = [(0.0, 0.07), (0.03, 0.07), (0.05, 0.04), (0.075, -0.02), (0.08, -0.05),
            (0.07, -0.05), (0.0, -0.05)]
    lib.lathe("DL_Head", prof, tuple(head_c), M["body"], verts=24, rot=rot)
    lib.cyl("DL_Bulb", 0.06, 0.01, tuple(head_c + aim * 0.045), M["bulb"], r=0.003, seg=1,
            verts=20, rot=rot)


def build():
    lib.begin(NAME)
    parts(materials())


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
