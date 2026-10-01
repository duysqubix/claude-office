"""Paper stack: a slightly messy pile of chunky A4 sheets (two coloured ones peeking out),
the top page printed with a title, lines and a blue-pen signature, held by a big binder
clip. 0.21 × 0.3 m, 0.04 m tall; origin at the desk-contact centre; the page reads from the
front (-Y)."""
import math

import lib
from decor import _decor as D

NAME = "paper_stack"
AO_RES = 256
AO_DISTANCE = 0.015
META = dict(
    name="Paper stack", category="desk-item", priority="P0",
    description="Messy stack of A4 sheets with a printed top page and a binder clip",
    tags=["desk", "paperwork", "clutter"], tintable=[],
    anchors_bl={"top": (0, 0, 0.0294)},
)
W, L, T = 0.21, 0.297, 0.0042
# (dx, dy, yaw degrees, material) bottom to top
SHEETS = [(0.002, -0.003, 1.5, "paper2"), (-0.004, 0.002, -2.0, "paper"),
          (0.008, 0.005, 4.0, "yellow"), (-0.002, -0.004, -1.0, "paper"),
          (-0.009, 0.004, -5.0, "blue"), (0.003, 0.001, 2.0, "paper2"),
          (0.0, -0.002, -0.8, "paper")]
TOP = len(SHEETS) * T


def materials():
    return dict(
        paper=D.mat("Paper", "paper", rough=0.85),
        paper2=D.mat("PaperOld", "paper2", rough=0.85),
        yellow=D.mat("PaperYellow", "#FFE7A0", rough=0.85),
        blue=D.mat("PaperBlue", "#CFEAFF", rough=0.85),
        line=D.mat("PrintLine", "#B9BFCC", rough=0.8),
        title=D.mat("PrintTitle", "ink", rough=0.7),
        logo=D.mat("PrintLogo", "coral", rough=0.7),
        pen=D.mat("PenInk", "blue", rough=0.6),
        clip=D.mat("Clip", "ink", rough=0.4),
        wire=D.mat("Wire", "chrome", rough=0.3, metal=0.4),
    )


def sheets(M):
    for i, (dx, dy, yaw, m) in enumerate(SHEETS):
        lib.rbox(f"Sheet{i}", (W, L, T), (dx, dy, T / 2 + i * T), M[m], r=0.0016, seg=1,
                 rot=(0, 0, math.radians(yaw)))


def print_top(M):
    before = D.snapshot()
    z = 0.0002
    D.prism("Pr_Title", D.rrect_pts(0.1, 0.012, 0.006), 0.0004, M["title"],
            loc=(-0.035, 0.112, z), back=False)
    D.prism("Pr_Logo", D.circle_pts(0.012, 20), 0.0004, M["logo"], loc=(0.072, 0.112, z),
            back=False)
    for i, w in enumerate((0.16, 0.15, 0.165, 0.12, 0.158, 0.14, 0.09)):
        D.prism(f"Pr_Line{i}", D.rrect_pts(w, 0.0055, 0.00275), 0.0004, M["line"],
                loc=(-0.0825 + w / 2, 0.078 - i * 0.02, z), back=False)
    sig = [(0.02, -0.085, z + 0.0008), (0.03, -0.075, z + 0.0008), (0.036, -0.092, z + 0.0008),
           (0.045, -0.078, z + 0.0008), (0.05, -0.09, z + 0.0008), (0.066, -0.083, z + 0.0008)]
    D.tube("Pr_Signature", sig, 0.0012, M["pen"], verts=6, smooth=4)
    dx, dy, yaw, _ = SHEETS[-1]
    D.place(D.since(before), loc=(dx, dy, TOP), rot=(0, 0, math.radians(yaw)))


def binder_clip(M):
    cx, edge = -0.04, L / 2 - 0.004
    before = D.snapshot()
    lib.rbox("Clip_Jaw", (0.066, 0.03, 0.007), (cx, edge - 0.011, TOP + 0.0035), M["clip"],
             r=0.0028, seg=2)
    lib.rbox("Clip_Spine", (0.066, 0.009, TOP + 0.012), (cx, edge + 0.007, (TOP + 0.012) / 2),
             M["clip"], r=0.0035, seg=2)
    for s in (-1, 1):
        x = cx + s * 0.022
        D.tube(f"Clip_Wire{s}", [(x, edge - 0.008, TOP + 0.0075), (x, edge - 0.04, TOP + 0.0088),
                                  (x - s * 0.005, edge - 0.048, TOP + 0.0088),
                                  (x - s * 0.015, edge - 0.046, TOP + 0.0086),
                                  (x - s * 0.016, edge - 0.008, TOP + 0.0075)],
               0.0018, M["wire"], verts=6, smooth=3, caps="round")
    D.place(D.since(before), rot=(0, 0, math.radians(SHEETS[-1][2])))


def build():
    lib.begin(NAME)
    M = materials()
    sheets(M)
    print_top(M)
    binder_clip(M)


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META)
