"""Ping pong table: toy-scale table with a blue top and white lines, a net on chunky posts,
fat folding leg frames, two paddles and a ball. Long axis along X; origin at the floor
centre."""
import math

import lib

NAME = "ping_pong_table"
AO_RES = 512
L, W, TOP = 2.3, 1.25, 0.76
META = dict(
    name="Ping pong table", category="furniture", priority="P2",
    description="Blue ping pong table with net, paddles and a ball",
    tags=["game-room", "fun"], tintable=["Accent"],
    anchors_bl={"top": (0, 0, TOP), "playerA": (-1.5, 0, 0), "playerB": (1.5, 0, 0)},
)


def materials():
    return dict(
        top=lib.mat("Accent", "#3D7CFF", rough=0.5),
        line=lib.mat("Lines", "#FFFFFF", rough=0.5),
        frame=lib.mat("Frame", lib.P["chairBase"], rough=0.55),
        net=lib.mat("Net", "#F4F7FB", rough=0.8),
        red=lib.mat("Rubber", "#FF5A5F", rough=0.6),
        wood=lib.mat("Wood", lib.P["wood"], rough=0.6),
        ball=lib.mat("Ball", "#FF9F45", rough=0.4),
    )


def table(M):
    th = 0.05
    lib.rbox("PP_Top", (L, W, th), (0, 0, TOP - th / 2), M["top"], r=0.02, seg=2)
    z = TOP + 0.001
    lw = 0.025
    lib.rbox("PP_LineC", (L - 0.06, lw, 0.004), (0, 0, z), M["line"], r=0.0015, seg=1)
    for s in (-1, 1):
        lib.rbox(f"PP_LineS{s}", (L - 0.02, lw, 0.004), (0, s * (W / 2 - 0.02), z), M["line"],
                 r=0.0015, seg=1)
        lib.rbox(f"PP_LineE{s}", (lw, W - 0.02, 0.004), (s * (L / 2 - 0.02), 0, z), M["line"],
                 r=0.0015, seg=1)
    for s in (-1, 1):
        x = s * 0.75
        for t in (-1, 1):
            lib.rbox(f"PP_Leg{s}{t}", (0.06, 0.06, TOP - 0.1), (x, t * 0.48, (TOP - 0.1) / 2 + 0.05),
                     M["frame"], r=0.025, seg=2)
            lib.cyl(f"PP_Wheel{s}{t}", 0.05, 0.04, (x, t * 0.48, 0.05), M["frame"], r=0.015,
                    seg=1, verts=14, rot=(0, math.pi / 2, 0))
        lib.rbox(f"PP_Brace{s}", (0.05, 0.96, 0.05), (x, 0, 0.3), M["frame"], r=0.02, seg=1)
        lib.rbox(f"PP_Under{s}", (0.06, W - 0.15, 0.05), (x, 0, TOP - 0.075), M["frame"],
                 r=0.02, seg=1)


def net(M):
    h = 0.15
    lib.rbox("PP_Net", (0.012, W + 0.06, h - 0.02), (0, 0, TOP + h / 2), M["net"], r=0.005,
             seg=1)
    lib.rbox("PP_NetTape", (0.02, W + 0.06, 0.02), (0, 0, TOP + h - 0.01), M["line"], r=0.008,
             seg=1)
    for s in (-1, 1):
        lib.cyl(f"PP_Post{s}", 0.02, h + 0.03, (0, s * (W / 2 + 0.04), TOP + h / 2 - 0.01),
                M["frame"], r=0.008, seg=1, verts=12)


def paddles(M):
    for i, (x, y, a) in enumerate(((-0.7, 0.25, 0.4), (0.75, -0.3, 2.6))):
        lib.cyl(f"PP_Blade{i}", 0.085, 0.014, (x, y, TOP + 0.008), M["red"], r=0.005, seg=1,
                verts=24)
        d = (math.cos(a), math.sin(a))
        lib.rbox(f"PP_Handle{i}", (0.12, 0.035, 0.026), (x + d[0] * 0.13, y + d[1] * 0.13,
                 TOP + 0.014), M["wood"], r=0.012, seg=1, rot=(0, 0, a))
    lib.sphere("PP_Ball", 0.025, (0.3, 0.25, TOP + 0.025), M["ball"], u=14, v=7)


STEPS = [table, net, paddles]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
