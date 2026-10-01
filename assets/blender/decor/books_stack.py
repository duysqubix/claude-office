"""Books stack: four chunky hardbacks in a slightly skewed pile (blue, coral, yellow, teal),
cream page blocks inset under overhanging covers, spines with a cream title label and gold
bands, and a red bookmark ribbon spilling out of the top book. 0.25 × 0.18 m, 0.15 m tall;
origin at the desk-contact centre; most spines face -Y."""
import math

import lib
from decor import _decor as D

NAME = "books_stack"
AO_RES = 256
AO_DISTANCE = 0.025
META = dict(
    name="Books stack", category="desk-item", priority="P1",
    description="Pile of four chunky hardback books with a bookmark ribbon",
    tags=["desk", "shelf", "clutter", "reading"], tintable=[],
    anchors_bl={"top": (0, 0, 0.149)},
)
BOARD = 0.0042
# (cover, (w, d, t), yaw degrees, x offset, spine facing front)
BOOKS = [("blue", (0.25, 0.18, 0.045), 0, 0.0, True),
         ("coral", (0.23, 0.165, 0.034), 7, 0.004, False),
         ("yellow", (0.215, 0.155, 0.04), -5, 0.008, True),
         ("teal", (0.18, 0.13, 0.03), 13, -0.01, True)]


def materials():
    return dict(
        blue=D.mat("CoverBlue", "blue", rough=0.55),
        coral=D.mat("CoverCoral", "coral", rough=0.55),
        yellow=D.mat("CoverYellow", "yellow", rough=0.55),
        teal=D.mat("CoverTeal", "teal", rough=0.55),
        pages=D.mat("Pages", "#FFF6E3", rough=0.85),
        label=D.mat("SpineLabel", "cream", rough=0.6),
        band=D.mat("SpineBand", "#FFD45C", rough=0.4, metal=0.2),
        ribbon=D.mat("Ribbon", "red", rough=0.5),
    )


def book(name, M, cover, size, spine_front):
    """One hardback at the origin (bottom at z = 0), spine on -Y unless turned."""
    w, d, t = size
    before = D.snapshot()
    lib.rbox(f"{name}_Bot", (w, d, BOARD), (0, 0, BOARD / 2), M[cover], r=0.0018, seg=1)
    lib.rbox(f"{name}_Top", (w, d, BOARD), (0, 0, t - BOARD / 2), M[cover], r=0.0018, seg=1)
    lib.rbox(f"{name}_Spine", (w, 0.012, t), (0, -d / 2 + 0.006, t / 2), M[cover],
             r=min(0.0058, t * 0.28), seg=2)
    lib.rbox(f"{name}_Pages", (w - 0.008, d - 0.01, t - 2 * BOARD + 0.001), (0, 0.001, t / 2),
             M["pages"], r=0.0015, seg=1)
    y = -d / 2 - 0.0004
    D.face(f"{name}_Label", D.rrect_pts(w * 0.36, t * 0.46, t * 0.08, steps=2), M["label"],
           loc=(0, y, t / 2), rot=D.FRONT)
    for s in (-1, 1):
        D.face(f"{name}_Band{s}", D.rrect_pts(0.0075, t - 2 * BOARD - 0.002, 0.002, steps=1),
               M["band"], loc=(s * (w / 2 - 0.026), y, t / 2), rot=D.FRONT)
    parts = D.since(before)
    if not spine_front:
        D.place(parts, rot=(0, 0, math.pi))
    return parts


def build():
    lib.begin(NAME)
    M = materials()
    z = 0.0
    for i, (cover, size, yaw, dx, front) in enumerate(BOOKS):
        parts = book(f"Book{i}", M, cover, size, front)
        if i == len(BOOKS) - 1:
            # Bookmark ribbon slipping out of the top book's tail end and draping down.
            w, d, t = size
            before = D.snapshot()
            D.tube("Ribbon", [(w / 2 - 0.02, 0.02, t * 0.5), (w / 2 + 0.004, 0.02, t * 0.5),
                              (w / 2 + 0.014, 0.024, t * 0.2), (w / 2 + 0.017, 0.03, -0.022)],
                   0.0027, M["ribbon"], verts=6, smooth=4, caps="round")
            parts += D.since(before)
        D.place(parts, loc=(dx, 0, z), rot=(0, 0, math.radians(yaw)))
        z += size[2]


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META)
