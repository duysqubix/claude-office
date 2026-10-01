"""Bookshelf: chunky wooden shelf unit with four shelves of fat colourful books (some
leaning), a gold star trophy and a little stack. Front faces -Y; origin at the floor centre."""
import math
import random

import lib

NAME = "bookshelf"
AO_RES = 512
W, D, H = 0.92, 0.34, 1.62
SHELVES = (0.06, 0.46, 0.86, 1.26)          # shelf top heights
BOOK_COLOURS = ["#FF6B6B", "#4D96FF", "#FFD93D", "#6BCB77", "#B983FF", "#FF9F45",
                "#00C2C7", "#FF7EB6"]
META = dict(
    name="Bookshelf", category="furniture", priority="P1",
    description="Wooden bookshelf packed with chunky colourful books and a trophy",
    tags=["storage", "decor", "manager"], tintable=[], anchors_bl={},
)


def materials():
    M = dict(
        wood=lib.mat("Wood", lib.P["wood"], rough=0.6),
        back=lib.mat("WoodBack", "#B07B4C", rough=0.7),
        gold=lib.mat("Gold", "#F2C14E", rough=0.35, metal=0.4),
        paper=lib.mat("Pages", lib.P["paper"], rough=0.8),
    )
    M["books"] = [lib.mat(f"Book{i}", c, rough=0.6) for i, c in enumerate(BOOK_COLOURS)]
    return M


def frame(M):
    t = 0.05
    lib.rbox("BS_Back", (W - 0.04, 0.03, H - 0.04), (0, D / 2 - 0.02, H / 2), M["back"], r=0.01,
             seg=1)
    for s in (-1, 1):
        lib.rbox(f"BS_Side{s}", (t, D, H), (s * (W / 2 - t / 2), 0, H / 2), M["wood"], r=0.02,
                 seg=2)
    lib.rbox("BS_Top", (W + 0.04, D + 0.03, t), (0, 0, H - t / 2 + 0.01), M["wood"], r=0.022,
             seg=2)
    for i, z in enumerate(SHELVES):
        lib.rbox(f"BS_Shelf{i}", (W - 2 * t + 0.01, D - 0.02, 0.04), (0, 0, z - 0.02),
                 M["wood"], r=0.012, seg=1)


def books(M):
    rnd = random.Random(7)
    inner = W - 0.12
    for si, z in enumerate(SHELVES):
        x = -inner / 2
        end = inner / 2 - (0.22 if si == 2 else 0.0)  # leave room for the trophy shelf
        k = 0
        while x < end - 0.05:
            w = rnd.uniform(0.045, 0.075)
            h = rnd.uniform(0.24, 0.32)
            d = rnd.uniform(0.2, 0.24)
            lean = 0.0
            if rnd.random() < 0.12 and x + w + 0.08 < end:
                lean = math.radians(14)
            mat = M["books"][rnd.randrange(len(M["books"]))]
            lib.rbox(f"BS_Book{si}_{k}", (w, d, h),
                     (x + w / 2 + (h / 2) * math.sin(lean), -0.01, z + h / 2 * math.cos(lean)),
                     mat, r=0.012, seg=1, rot=(0, lean, 0))
            x += w + (0.05 if lean else 0.004)
            k += 1
    # A lying stack and a trophy on the third shelf.
    z = SHELVES[2]
    for i in range(3):
        lib.rbox(f"BS_Stack{i}", (0.18 - i * 0.02, 0.2, 0.04), (inner / 2 - 0.12, -0.01,
                 z + 0.02 + i * 0.04), M["books"][(i * 3) % 8], r=0.01, seg=1)
    tz = z + 0.12
    lib.cyl("BS_TrophyBase", 0.035, 0.03, (inner / 2 - 0.12, -0.02, tz + 0.015), M["gold"],
            r=0.008, seg=1, verts=12)
    lib.cyl("BS_TrophyStem", 0.012, 0.05, (inner / 2 - 0.12, -0.02, tz + 0.055), M["gold"],
            r=0, verts=10)
    lib.sphere("BS_TrophyCup", 0.045, (inner / 2 - 0.12, -0.02, tz + 0.1), M["gold"],
               scale=(1, 1, 0.8), u=16, v=8)


STEPS = [frame, books]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
