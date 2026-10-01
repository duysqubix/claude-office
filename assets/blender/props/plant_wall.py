"""Plant wall: a living green wall panel. Chunky wooden frame, dark felt backing, and a dense
lush layer of soft rounded leaves in five greens with a few pink and yellow flowers poking
out. Origin at the wall-contact point (back centre); it faces -Y."""
import math
import random

import lib

NAME = "plant_wall"
AO_RES = 256
PW, PH = 1.9, 1.3
GREENS = ["#4CC46A", "#5CCB5F", "#46B35A", "#7BD66B", "#2E9E5B"]
META = dict(
    name="Plant wall", category="plant", priority="P1",
    description="Living green wall panel with soft leaves and flowers",
    tags=["team-room", "wall", "plant", "decor"], tintable=[],
    anchors_bl={"center": (0, -0.1, 0)},
    mount="wall: origin is the back centre",
)


def materials():
    M = dict(
        frame=lib.mat("Frame", lib.P["wood"], rough=0.6),
        felt=lib.mat("Felt", "#2F4A3A", rough=0.95),
        pink=lib.mat("FlowerPink", "#FF7EB6", rough=0.5),
        yellow=lib.mat("FlowerYellow", "#FFD93D", rough=0.5),
    )
    M["greens"] = [lib.mat(f"Leaf{i}", c, rough=0.6) for i, c in enumerate(GREENS)]
    return M


def frame(M):
    lib.rbox("PWl_Felt", (PW, 0.04, PH), (0, -0.02, 0), M["felt"], r=0.01, seg=1)
    t = 0.07
    for i, (sx, sz, w, h) in enumerate(((0, PH / 2 + t / 2, PW + 2 * t, t),
                                        (0, -PH / 2 - t / 2, PW + 2 * t, t),
                                        (-PW / 2 - t / 2, 0, t, PH), (PW / 2 + t / 2, 0, t, PH))):
        lib.rbox(f"PWl_Frame{i}", (w, 0.14, h), (sx, -0.07, sz), M["frame"], r=0.03, seg=2)


def foliage(M):
    rnd = random.Random(5)
    cols, rows = 10, 7
    k = 0
    for r in range(rows):
        for c in range(cols):
            x = -PW / 2 + 0.1 + c * (PW - 0.2) / (cols - 1) + rnd.uniform(-0.03, 0.03)
            z = -PH / 2 + 0.1 + r * (PH - 0.2) / (rows - 1) + rnd.uniform(-0.03, 0.03)
            yaw = rnd.uniform(-0.6, 0.6)
            pitch = rnd.uniform(-0.5, 0.5)
            lib.sphere(f"PWl_Leaf{k}", 1.0, (x, -0.08 - (k % 2) * 0.03, z),
                       M["greens"][rnd.randrange(5)], scale=(0.11, 0.03, 0.14), u=8, v=4,
                       rot=(math.pi / 2 + pitch, rnd.uniform(0, math.pi), yaw))
            k += 1
    for i in range(9):
        x = rnd.uniform(-PW / 2 + 0.15, PW / 2 - 0.15)
        z = rnd.uniform(-PH / 2 + 0.15, PH / 2 - 0.15)
        mat = M["pink"] if i % 2 else M["yellow"]
        for p in range(4):
            a = 2 * math.pi * p / 4
            lib.sphere(f"PWl_Petal{i}_{p}", 0.026, (x + 0.026 * math.cos(a), -0.15,
                       z + 0.026 * math.sin(a)), mat, scale=(1, 0.5, 1), u=6, v=4)
        lib.sphere(f"PWl_FlowerC{i}", 0.017, (x, -0.165, z), M["yellow"] if i % 2 else M["pink"],
                   u=6, v=4)


STEPS = [frame, foliage]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
