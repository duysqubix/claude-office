"""Sticky wall: a wall-mounted kanban board (TODO / DOING / DONE) in a chunky frame, covered in
pastel sticky notes at jaunty angles, a few with a curled corner, plus a pinned marker.
Origin at the wall-contact point (back centre); the board faces -Y."""
import math
import random

import lib

NAME = "sticky_wall"
AO_RES = 512
BW, BH = 1.8, 1.1
NOTE_COLOURS = ["#FFE066", "#FF9DCB", "#8FE0C8", "#7DB8F0", "#FFB86B", "#C8A2FF"]
META = dict(
    name="Sticky wall", category="decor", priority="P0",
    description="Kanban wall board covered in sticky notes",
    tags=["team-room", "wall", "planning"], tintable=[],
    anchors_bl={"center": (0, -0.04, 0)},
    mount="wall: origin is the back centre",
)


def materials():
    M = dict(
        board=lib.mat("Cork", "#F4F7FB", rough=0.7),
        frame=lib.mat("Frame", lib.P["wood"], rough=0.6),
        ink=lib.mat("Ink", lib.P["ink"], rough=0.6),
        line=lib.mat("Divider", "#C8D0DC", rough=0.6),
    )
    M["notes"] = [lib.mat(f"Note{i}", c, rough=0.7) for i, c in enumerate(NOTE_COLOURS)]
    return M


def board(M):
    lib.rbox("SW_Board", (BW, 0.03, BH), (0, -0.015, 0), M["board"], r=0.01, seg=1)
    t = 0.06
    for i, (sx, sz, w, h) in enumerate(((0, BH / 2 + t / 2, BW + 2 * t, t),
                                        (0, -BH / 2 - t / 2, BW + 2 * t, t),
                                        (-BW / 2 - t / 2, 0, t, BH), (BW / 2 + t / 2, 0, t, BH))):
        lib.rbox(f"SW_Frame{i}", (w, 0.05, h), (sx, -0.025, sz), M["frame"], r=0.022, seg=2)
    for i, x in enumerate((-BW / 6, BW / 6)):
        lib.rbox(f"SW_Div{i}", (0.012, 0.006, BH - 0.06), (x, -0.033, -0.02), M["line"],
                 r=0.003, seg=1)
    for i, title in enumerate(("TODO", "DOING", "DONE")):
        lib.text(f"SW_Title{i}", title, 0.06, ((i - 1) * BW / 3, -0.034, BH / 2 - 0.07),
                 M["ink"], extrude=0, bevel=0, res=1)


def notes(M):
    rnd = random.Random(11)
    counts = (9, 6, 11)
    for col, n in enumerate(counts):
        cx = (col - 1) * BW / 3
        for k in range(n):
            r, c = divmod(k, 3)
            x = cx + (c - 1) * 0.17 + rnd.uniform(-0.02, 0.02)
            z = BH / 2 - 0.2 - r * 0.2 + rnd.uniform(-0.02, 0.02)
            if z < -BH / 2 + 0.1:
                continue
            ang = math.radians(rnd.uniform(-9, 9))
            mat = M["notes"][rnd.randrange(len(M["notes"]))]
            lib.rbox(f"SW_Note{col}_{k}", (0.13, 0.006, 0.13), (x, -0.036 - k * 0.0003, z), mat,
                     r=0.0025, seg=1, rot=(0, ang, 0))
            if rnd.random() < 0.25:
                lib.rbox(f"SW_Curl{col}_{k}", (0.05, 0.004, 0.04),
                         (x + 0.045, -0.05, z - 0.05), mat, r=0.0018, seg=1,
                         rot=(math.radians(35), ang, 0))
    lib.cyl("SW_Marker", 0.016, 0.14, (BW / 2 - 0.15, -0.05, -BH / 2 + 0.08), M["ink"],
            r=0.006, seg=1, verts=12, rot=(0, math.pi / 2, 0))


STEPS = [board, notes]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
