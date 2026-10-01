"""Clipboard: rounded board (tintable `Accent`, warm wood by default) with a chunky chrome
clip holding a checklist: title bar, five rows of boxes and lines, three green ticks and a
little blue-pen smiley. Lies flat; 0.23 × 0.32 m; origin at the desk-contact centre; the
page reads from the front (-Y)."""
import math

import lib
from decor import _decor as D

NAME = "clipboard"
AO_RES = 256
AO_DISTANCE = 0.03
BW, BL, BT = 0.23, 0.32, 0.008
META = dict(
    name="Clipboard", category="desk-item", priority="P0",
    description="Clipboard with a chunky clip and a half-ticked checklist",
    tags=["desk", "paperwork", "checklist"], tintable=["Accent"],
    anchors_bl={"page": (0, -0.015, BT + 0.002)},
)


def materials():
    return dict(
        board=D.mat("Accent", "wood", rough=0.6),
        paper=D.mat("Paper", "paper", rough=0.85),
        chrome=D.mat("Chrome", "chrome", rough=0.3, metal=0.4),
        ink=D.mat("Ink", "ink", rough=0.7),
        line=D.mat("PrintLine", "#B9BFCC", rough=0.8),
        box=D.mat("Box", "#8F96A8", rough=0.7),
        tick=D.mat("Tick", "#2FAF6A", rough=0.55),
        pen=D.mat("PenInk", "blue", rough=0.6),
    )


def board(M):
    D.prism("Board", D.rrect_pts(BW, BL, 0.02, steps=4), BT, M["board"], r=0.003, seg=2)
    lib.rbox("Page", (0.205, 0.272, 0.0022), (0, -0.016, BT + 0.0011), M["paper"], r=0.0008,
             seg=1)


def checklist(M):
    z = BT + 0.0023
    D.face("Ck_Title", D.rrect_pts(0.095, 0.012, 0.006), M["ink"], loc=(-0.033, 0.083, z))
    rows = [(0.11, True), (0.085, True), (0.12, False), (0.07, True), (0.1, False)]
    for i, (w, ticked) in enumerate(rows):
        y = 0.05 - i * 0.03
        D.face(f"Ck_Box{i}", D.rrect_pts(0.017, 0.017, 0.004), M["box"], loc=(-0.074, y, z))
        D.face(f"Ck_BoxIn{i}", D.rrect_pts(0.0115, 0.0115, 0.0025), M["paper"],
               loc=(-0.074, y, z + 0.0002))
        D.face(f"Ck_Line{i}", D.rrect_pts(w, 0.006, 0.003), M["line"],
               loc=(-0.056 + w / 2, y, z))
        if ticked:
            D.tube(f"Ck_Tick{i}", [(-0.0815, y + 0.002, z + 0.0016), (-0.075, y - 0.0055, z + 0.0016),
                                   (-0.0635, y + 0.011, z + 0.0016)], 0.0019, M["tick"],
                   verts=8, caps="round")
    # Blue-pen smiley in the corner.
    cx, cy = 0.065, -0.112
    ring = [(cx + 0.012 * math.cos(a), cy + 0.012 * math.sin(a), z + 0.0009)
            for a in [2 * math.pi * k / 16 for k in range(17)]]
    D.tube("Ck_Smile_Face", ring, 0.0009, M["pen"], verts=6, caps=None)
    for s in (-1, 1):
        lib.sphere(f"Ck_Smile_Eye{s}", 0.0015, (cx + s * 0.0042, cy + 0.0035, z + 0.0004),
                   M["pen"], scale=(1, 1, 0.4), u=8, v=4)
    D.tube("Ck_Smile_Mouth", [(cx - 0.006, cy - 0.002, z + 0.0009), (cx, cy - 0.0065, z + 0.0009),
                              (cx + 0.006, cy - 0.002, z + 0.0009)], 0.0009, M["pen"], verts=6,
           smooth=3)


def clip(M):
    y = BL / 2 - 0.022
    lib.rbox("Clip_Plate", (0.11, 0.036, 0.004), (0, y, BT + 0.003), M["chrome"], r=0.0018,
             seg=2)
    lib.cyl("Clip_Roll", 0.0085, 0.098, (0, y + 0.006, BT + 0.009), M["chrome"], r=0.003, seg=2,
            verts=20, rot=(0, math.pi / 2, 0))
    lib.rbox("Clip_Jaw", (0.084, 0.026, 0.005), (0, y - 0.016, BT + 0.006), M["chrome"],
             r=0.0022, seg=2, rot=(math.radians(-14), 0, 0))
    for s in (-1, 1):
        lib.sphere(f"Clip_Rivet{s}", 0.004, (s * 0.043, y + 0.006, BT + 0.0055), M["chrome"],
                   scale=(1, 1, 0.5), u=10, v=5)
    lib.torus("Clip_Ring", 0.008, 0.0022, (0, y + 0.02, BT + 0.007), M["chrome"], seg=16,
              ring=6, rot=(math.radians(70), 0, 0))


def build():
    lib.begin(NAME)
    M = materials()
    board(M)
    checklist(M)
    clip(M)


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META)
