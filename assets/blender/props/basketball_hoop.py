"""Basketball hoop (wall-mounted): chunky rounded backboard with a target square, a fat orange
rim on a bracket, and a rope net made of tapering rings and strands. Origin at the
wall-contact point (back centre of the backboard); the hoop sticks out toward -Y."""
import math

import lib

NAME = "basketball_hoop"
AO_RES = 256
RIM_R, RIM_Y, RIM_Z = 0.2, -0.32, -0.22
META = dict(
    name="Basketball hoop", category="decor", priority="P1",
    description="Wall-mounted basketball hoop with a rope net",
    tags=["game-room", "fun", "wall"], tintable=["Accent"],
    anchors_bl={"rim": (0, RIM_Y, RIM_Z)},
    mount="wall: origin is the back centre of the backboard (mount ≈ 2.6 m up)",
)


def materials():
    return dict(
        board=lib.mat("Backboard", "#FFFFFF", rough=0.5),
        accent=lib.mat("Accent", "#FF5A5F", rough=0.5),
        rim=lib.mat("Rim", "#FF7A2F", rough=0.4, metal=0.2),
        net=lib.mat("Net", "#FFFFFF", rough=0.8),
        bracket=lib.mat("Bracket", lib.P["chairBase"], rough=0.5),
    )


def board(M):
    lib.rbox("BH_Board", (0.9, 0.05, 0.62), (0, -0.025, 0), M["board"], r=0.03, seg=2)
    t = 0.035
    for i, (sx, sz, w, h) in enumerate(((0, 0.29, 0.9, t), (0, -0.29, 0.9, t),
                                        (-0.43, 0, t, 0.62), (0.43, 0, t, 0.62))):
        lib.rbox(f"BH_Edge{i}", (w, 0.056, h), (sx, -0.028, sz), M["accent"], r=0.015, seg=1)
    for i, (sx, sz, w, h) in enumerate(((0, -0.03, 0.34, 0.025), (0, -0.2, 0.34, 0.025),
                                        (-0.16, -0.115, 0.025, 0.19), (0.16, -0.115, 0.025, 0.19))):
        lib.rbox(f"BH_Target{i}", (w, 0.006, h), (sx, -0.052, sz), M["accent"], r=0.004, seg=1)


def rim(M):
    lib.rbox("BH_Bracket", (0.16, 0.14, 0.04), (0, -0.11, RIM_Z - 0.01), M["bracket"],
             r=0.015, seg=1)
    lib.torus("BH_Rim", RIM_R, 0.016, (0, RIM_Y, RIM_Z), M["rim"], seg=32, ring=8)


def net(M):
    for i, (r, dz) in enumerate(((0.19, -0.06), (0.16, -0.13), (0.13, -0.2))):
        lib.torus(f"BH_NetRing{i}", r, 0.006, (0, RIM_Y, RIM_Z + dz), M["net"], seg=20, ring=5)
    for i in range(10):
        a = 2 * math.pi * i / 10
        top = (RIM_R * math.cos(a), RIM_Y + RIM_R * math.sin(a), RIM_Z)
        bot = (0.13 * math.cos(a + 0.3), RIM_Y + 0.13 * math.sin(a + 0.3), RIM_Z - 0.2)
        mid = tuple((top[k] + bot[k]) / 2 for k in range(3))
        from mathutils import Vector
        d = Vector(bot) - Vector(top)
        lib.cyl(f"BH_Strand{i}", 0.005, d.length, mid, M["net"], r=0, verts=5,
                rot=d.to_track_quat("Z", "Y").to_euler())


STEPS = [board, rim, net]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
