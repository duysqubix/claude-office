"""Binder: an upright lever-arch ring binder (tintable `Accent` covers and spine) stuffed with
cream pages, a paper spine label reading "TPS REPORTS" and a chrome finger hole. Stands on
its bottom edge with the spine facing -Y (as on a shelf). 0.075 × 0.29 × 0.31 m; origin at
the floor-contact centre."""
import math

import lib
from decor import _decor as D

NAME = "binder"
AO_RES = 256
AO_DISTANCE = 0.04
T, DP, H = 0.075, 0.29, 0.31
META = dict(
    name="Binder", category="desk-item", priority="P1",
    description="Upright ring binder with a \"TPS REPORTS\" spine label and a finger hole",
    tags=["desk", "shelf", "paperwork"], tintable=["Accent"],
    anchors_bl={"spineLabel": (0, -DP / 2, 0.2)},
)


def materials():
    return dict(
        cover=D.mat("Accent", "blue", rough=0.5),
        pages=D.mat("Pages", "#FFF6E3", rough=0.85),
        # Not "Label": that name means a game-painted face (planar UVs, no AO).
        label=D.mat("SpineLabel", "paper", rough=0.6),
        ink=D.mat("Ink", "ink", rough=0.6),
        chrome=D.mat("Chrome", "chrome", rough=0.3, metal=0.4),
        tabs=[D.mat("TabYellow", "yellow", rough=0.6), D.mat("TabPink", "pink", rough=0.6),
              D.mat("TabMint", "mint", rough=0.6)],
    )


def build():
    lib.begin(NAME)
    M = materials()
    lib.rbox("Spine", (T, 0.014, H), (0, -DP / 2 + 0.007, H / 2), M["cover"], r=0.007, seg=2)
    for s in (-1, 1):
        lib.rbox(f"Cover{s}", (0.006, DP - 0.004, H), (s * (T / 2 - 0.003), 0.002, H / 2),
                 M["cover"], r=0.0028, seg=1)
    lib.rbox("Pages", (T - 0.017, DP - 0.022, H - 0.018), (0, 0.006, H / 2 - 0.002), M["pages"],
             r=0.002, seg=1)
    # Index dividers peeking out of the top of the pages.
    for i, (yy, m) in enumerate(((-0.07, 0), (0.0, 1), (0.07, 2))):
        lib.rbox(f"Tab{i}", (0.0016, 0.034, 0.03), (-0.008 + i * 0.008, yy, H - 0.004),
                 M["tabs"][m], r=0.0007, seg=1)
    y = -DP / 2 - 0.0004
    D.face("SpineLabel", D.rrect_pts(0.047, 0.165, 0.006, steps=3), M["label"], loc=(0, y, 0.198),
           rot=D.FRONT)
    D.text("Label_Text", "TPS REPORTS", 0.0175, M["ink"], loc=(0, y - 0.0004, 0.198), depth=0,
           res=2, rot=(math.pi / 2, -math.pi / 2, 0))
    D.ring("Hole_Ring", 0.0148, 0.0098, M["chrome"], n=20, loc=(0, y, 0.066), rot=D.FRONT)
    D.face("Hole", D.circle_pts(0.0099, 20), M["ink"], loc=(0, y + 0.0002, 0.066), rot=D.FRONT)


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META)
