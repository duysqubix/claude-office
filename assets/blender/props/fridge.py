"""Fridge: rounded retro fridge in mint with a chrome handle and badge. The door is a separate
node `Door` hinged on its left edge (viewer's left), pivot on the hinge line, so the game
swings it open about the vertical axis. Behind it: a white liner with chrome shelves.
Origin at the floor centre; door faces -Y."""
import math

import lib

NAME = "fridge"
AO_RES = 512
W, D, H = 0.72, 0.70, 1.72
HINGE = (-W / 2 + 0.02, -D / 2 - 0.035, 0)
META = dict(
    name="Fridge", category="appliance", priority="P0",
    description="Rounded retro fridge with a swing-open door",
    tags=["kitchen", "break-room"], tintable=[],
    anchors_bl={"front": (0, -0.75, 0)},
    nodes={"Door": "pivot on the hinge (left edge); rotate about +Y (three) to open"},
)


def materials():
    return dict(
        body=lib.mat("Body", "#8FE0C8", rough=0.45),
        liner=lib.mat("Liner", "#FFFFFF", rough=0.5),
        chrome=lib.mat("Chrome", lib.P["metal"], rough=0.25, metal=0.4),
        base=lib.mat("Base", lib.P["chairBase"], rough=0.7),
        seam=lib.mat("Seam", "#6CC9B0", rough=0.5),
    )


def body(M):
    lib.rbox("FR_Body", (W, D, H - 0.06), (0, 0, 0.06 + (H - 0.06) / 2), M["body"], r=0.11,
             seg=3)
    lib.rbox("FR_Plinth", (W - 0.1, D - 0.12, 0.08), (0, 0.02, 0.04), M["base"], r=0.025,
             seg=2)
    lib.rbox("FR_Liner", (W - 0.14, 0.01, H - 0.3), (0, -D / 2 - 0.001, 0.92), M["liner"],
             r=0.004, seg=1)
    for i, z in enumerate((0.55, 0.95, 1.3)):
        lib.rbox(f"FR_Shelf{i}", (W - 0.18, 0.012, 0.012), (0, -D / 2 - 0.008, z), M["chrome"],
                 r=0.005, seg=1)


def door(M):
    y = -D / 2 - 0.035
    parts = [
        lib.rbox("FR_Door", (W - 0.04, 0.07, H - 0.18), (0, y, 0.95), M["body"], r=0.06, seg=3),
        lib.rbox("FR_Seam", (W - 0.1, 0.012, 0.016), (0, y - 0.036, 1.3), M["seam"], r=0.006,
                 seg=1),
        lib.rbox("FR_HandleBar", (0.04, 0.035, 0.42), (W / 2 - 0.1, y - 0.075, 1.05),
                 M["chrome"], r=0.016, seg=2),
        lib.rbox("FR_HandlePostT", (0.03, 0.05, 0.03), (W / 2 - 0.1, y - 0.045, 1.22),
                 M["chrome"], r=0.01, seg=1),
        lib.rbox("FR_HandlePostB", (0.03, 0.05, 0.03), (W / 2 - 0.1, y - 0.045, 0.88),
                 M["chrome"], r=0.01, seg=1),
        lib.rbox("FR_Badge", (0.16, 0.012, 0.05), (0, y - 0.036, 1.55), M["chrome"], r=0.012,
                 seg=1),
    ]
    for p in parts:
        lib.node(p, "Door", pivot=HINGE)


STEPS = [body, door]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
