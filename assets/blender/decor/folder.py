"""Folder: a manila file folder lying flat, its front flap lifted a touch at the right to show
two sheets peeking out, a red "CONFIDENTIAL" rubber stamp on the flap and a chrome paperclip
on the top edge. 0.24 × 0.33 m; origin at the desk-contact centre; the stamp reads from the
front (-Y)."""
import math

import lib
from decor import _decor as D

NAME = "folder"
AO_RES = 256
AO_DISTANCE = 0.02
W, L = 0.24, 0.31
META = dict(
    name="Folder", category="desk-item", priority="P1",
    description="Manila folder with sheets peeking out, a CONFIDENTIAL stamp and a paperclip",
    tags=["desk", "paperwork", "clutter"], tintable=[],
    anchors_bl={"top": (0, 0, 0.012)},
)
HINGE = (-W / 2, 0, 0.0055)


def materials():
    return dict(
        manila=D.mat("Manila", "#EBC97E", rough=0.8),
        flap=D.mat("ManilaFlap", "#F3D894", rough=0.8),
        paper=D.mat("Paper", "paper", rough=0.85),
        red=D.mat("Stamp", "red", rough=0.6),
        chrome=D.mat("Chrome", "chrome", rough=0.3, metal=0.4),
    )


def back(M):
    hw, hl = W / 2, L / 2
    outline = [(-hw, -hl), (hw, -hl), (hw, hl), (-0.015, hl), (-0.027, hl + 0.018),
               (-0.098, hl + 0.018), (-0.11, hl), (-hw, hl)]
    D.prism("Back", D.rounded_pts(outline, 0.006, steps=2), 0.0025, M["manila"], r=0.0009, seg=1)
    lib.rbox("Sheet1", (0.214, 0.282, 0.0014), (0.016, 0.006, 0.0032), M["paper"], r=0.0005,
             seg=1, rot=(0, 0, math.radians(3)))
    lib.rbox("Sheet2", (0.214, 0.282, 0.0014), (0.004, 0.014, 0.0047), M["paper"], r=0.0005,
             seg=1, rot=(0, 0, math.radians(-2)))


def flap(M):
    before = D.snapshot()
    z = 0.0055
    D.prism("Flap", D.rrect_pts(W - 0.004, L - 0.008, 0.006, steps=2), 0.0025, M["flap"],
            loc=(0, -0.004, z), r=0.0009, seg=1)
    top = z + 0.0025 + 0.0004
    spin = math.radians(11)
    D.text("Stamp_Text", "CONFIDENTIAL", 0.021, M["red"], loc=(0.008, -0.03, top), rot=(0, 0, spin),
           depth=0, res=2)
    D.band("Stamp_Border", D.rrect_pts(0.205, 0.042, 0.008, steps=2),
           D.rrect_pts(0.197, 0.034, 0.005, steps=2), M["red"], loc=(0.008, -0.03, top),
           rot=(0, 0, spin))
    # Paperclip over the top edge.
    clip = [(0.0, 0.0), (0.0, 0.03), (0.0045, 0.0345), (0.009, 0.03), (0.009, -0.006),
            (0.0052, -0.0098), (0.0016, -0.006), (0.0016, 0.024), (0.0042, 0.0268),
            (0.0066, 0.024), (0.0066, 0.004)]
    cx, cy = 0.07, L / 2 - 0.03
    D.tube("Clip", [(cx + x, cy + y, top + 0.0012) for x, y in clip], 0.0011, M["chrome"],
           verts=5, smooth=3, caps="round")
    D.turn(D.since(before), HINGE, (0, math.radians(-4), 0))


def build():
    lib.begin(NAME)
    M = materials()
    back(M)
    flap(M)


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META)
