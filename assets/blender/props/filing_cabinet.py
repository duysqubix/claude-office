"""Filing cabinet ("Personnel Files"): chunky pastel-blue cabinet with three drawers that are
separate nodes `Drawer1` (top) .. `Drawer3` (bottom), each pivoted at its front face centre
so the game can slide it out along -Y. The top drawer carries a "PERSONNEL FILES" label.
Origin at the floor centre; drawers face -Y."""
import math

import lib

NAME = "filing_cabinet"
AO_RES = 512
W, D, H = 0.52, 0.62, 1.08
ROWS = (0.86, 0.54, 0.22)   # drawer centre heights, top → bottom
META = dict(
    name="Filing cabinet", category="furniture", priority="P0",
    description="Personnel Files cabinet with three slide-out drawers",
    tags=["manager", "interactable", "archive"], tintable=[],
    anchors_bl={"front": (0, -0.4, 0.9)},
    nodes={"Drawer1": "top drawer, slides along +Z (three)", "Drawer2": "middle",
           "Drawer3": "bottom"},
)


def materials():
    return dict(
        body=lib.mat("Body", "#8FB3E0", rough=0.55),
        front=lib.mat("DrawerFront", "#B6CFF0", rough=0.5),
        chrome=lib.mat("Chrome", lib.P["metal"], rough=0.28, metal=0.4),
        card=lib.mat("LabelCard", lib.P["paper"], rough=0.7),
        ink=lib.mat("Ink", lib.P["ink"], rough=0.6),
        base=lib.mat("Base", lib.P["chairBase"], rough=0.7),
    )


def body(M):
    lib.rbox("FC_Body", (W, D, H - 0.06), (0, 0, 0.06 + (H - 0.06) / 2), M["body"], r=0.045,
             seg=3)
    lib.rbox("FC_Plinth", (W - 0.06, D - 0.06, 0.07), (0, 0, 0.035), M["base"], r=0.02, seg=2)
    lib.rbox("FC_TopCap", (W + 0.02, D + 0.02, 0.04), (0, 0, H + 0.005), M["body"], r=0.02,
             seg=2)


def drawers(M):
    fy = -D / 2 - 0.02
    for i, z in enumerate(ROWS):
        n = f"Drawer{i + 1}"
        parts = [
            lib.rbox(f"FC_Front{i}", (W - 0.06, 0.045, 0.29), (0, fy, z), M["front"], r=0.02,
                     seg=2),
            lib.rbox(f"FC_Box{i}", (W - 0.1, D - 0.1, 0.24), (0, fy + D / 2 - 0.02, z),
                     M["body"], r=0.01, seg=1),
            # U-shaped pull bulging out of the front (-Y).
            lib.torus(f"FC_Handle{i}", 0.06, 0.013, (0, fy - 0.0225, z - 0.04), M["chrome"],
                      seg=12, ring=8, rot=(0, 0, math.pi), sweep=math.pi),
            lib.rbox(f"FC_Card{i}", (0.14, 0.008, 0.055), (0, fy - 0.025, z + 0.07), M["card"],
                     r=0.004, seg=1),
        ]
        for p in parts:
            lib.node(p, n, pivot=(0, fy - 0.0225, z))


def label(M):
    z = ROWS[0] + 0.07
    t = lib.text("FC_Label", "PERSONNEL\nFILES", 0.018, (0, -D / 2 - 0.05, z), M["ink"],
                 extrude=0, bevel=0, res=1)
    lib.node(t, "Drawer1")


STEPS = [body, drawers, label]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
