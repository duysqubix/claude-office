"""Whiteboard (wall-mounted): chunky rounded blue frame around a white `Board` surface the game
draws on (flat quad, planar 0..1 UVs, no AO), plus a marker tray with three fat markers and a
felt eraser. Origin at the wall-contact point (centre of the back); the board faces -Y."""
import math

import bmesh

import lib

NAME = "whiteboard"
AO_RES = 512
BW, BH = 1.8, 1.0
META = dict(
    name="Whiteboard", category="furniture", priority="P0",
    description="Wall whiteboard with chunky frame, marker tray, markers and eraser",
    tags=["wall", "interactable", "roster"], tintable=["Board"],
    anchors_bl={"boardCenter": (0, -0.041, 0)}, board=dict(width=BW, height=BH),
    mount="wall: origin is the back centre; board centre is at the origin height",
)


def materials():
    board = lib.mat("Board", "#FFFFFF", rough=0.35)
    board["no_ao"] = True
    return dict(
        frame=lib.mat("Frame", lib.P["deskAccents"][2], rough=0.55),
        back=lib.mat("Backing", "#F4F7FB", rough=0.6),
        board=board,
        tray=lib.mat("Tray", lib.P["metal"], rough=0.4),
        red=lib.mat("MarkerRed", "#FF5A5F", rough=0.5),
        blue=lib.mat("MarkerBlue", "#3D7CFF", rough=0.5),
        green=lib.mat("MarkerGreen", "#2EC4B6", rough=0.5),
        cap=lib.mat("MarkerBody", "#FFFFFF", rough=0.5),
        felt=lib.mat("Felt", lib.P["chairBase"], rough=0.9),
    )


def board(M):
    lib.rbox("WB_Backing", (BW, 0.03, BH), (0, -0.015, 0), M["back"], r=0.01, seg=1)
    bm = bmesh.new()
    w, h = BW - 0.02, BH - 0.02
    vs = [bm.verts.new(v) for v in ((-w / 2, 0, -h / 2), (w / 2, 0, -h / 2),
                                    (w / 2, 0, h / 2), (-w / 2, 0, h / 2))]
    bm.faces.new(vs)
    lib._link("WB_Board", bm, M["board"], loc=(0, -0.031, 0))


def frame(M):
    t, d = 0.07, 0.06
    lib.rbox("WB_FrameTop", (BW + 2 * t, d, t), (0, -d / 2, BH / 2 + t / 2), M["frame"],
             r=0.03, seg=3)
    lib.rbox("WB_FrameBot", (BW + 2 * t, d, t), (0, -d / 2, -BH / 2 - t / 2), M["frame"],
             r=0.03, seg=3)
    for s in (-1, 1):
        lib.rbox(f"WB_FrameSide{s}", (t, d, BH + 0.02), (s * (BW / 2 + t / 2), -d / 2, 0),
                 M["frame"], r=0.03, seg=3)


def tray(M):
    z = -BH / 2 - 0.075
    lib.rbox("WB_Tray", (1.0, 0.11, 0.03), (0, -0.07, z), M["tray"], r=0.012, seg=2)
    lib.rbox("WB_TrayLip", (1.0, 0.02, 0.04), (0, -0.12, z + 0.02), M["tray"], r=0.009, seg=1)
    for i, (mat, x) in enumerate(((M["red"], -0.3), (M["blue"], -0.15), (M["green"], 0.02))):
        lib.cyl(f"WB_Marker{i}", 0.014, 0.11, (x, -0.07, z + 0.03), M["cap"], r=0.006, seg=1,
                verts=12, rot=(0, math.pi / 2, 0))
        lib.cyl(f"WB_MarkerCap{i}", 0.016, 0.04, (x + 0.065, -0.07, z + 0.03), mat, r=0.007,
                seg=1, verts=12, rot=(0, math.pi / 2, 0))
    lib.rbox("WB_EraserFelt", (0.13, 0.05, 0.02), (0.28, -0.07, z + 0.025), M["felt"],
             r=0.008, seg=1)
    lib.rbox("WB_EraserTop", (0.13, 0.05, 0.03), (0.28, -0.07, z + 0.05), M["blue"], r=0.012,
             seg=2)


STEPS = [board, frame, tray]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
