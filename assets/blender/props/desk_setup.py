"""Desk setup: thick rounded white desk on slab legs with a coloured accent panel and drawer
pod (`Accent`, PALETTE.deskAccents), a chunky monitor whose screen is the emissive `Screen`
material (planar 0..1 UVs for the game's canvas texture), keyboard, mouse and a mug.
Front (where you sit) faces -Y; origin at the floor centre of the desk."""
import math

import bmesh

import lib

NAME = "desk_setup"
AO_RES = 512
META = dict(
    name="Desk setup (showcase)", category="furniture", priority="P0",
    description="Lookdev composite: desk, chunky monitor, keyboard, mouse and mug",
    tags=["desk", "composite", "preview"], tintable=["Accent", "Screen"],
    anchors_bl={"top": (0, 0, 0.75), "screen": (0, 0.064, 1.15), "seat": (0, -0.75, 0.5)},
)
TOP = 0.75


def materials():
    return dict(
        top=lib.mat("DeskTop", lib.P["deskTop"], rough=0.65),
        accent=lib.mat("Accent", lib.P["deskAccents"][2], rough=0.7),
        knob=lib.mat("Knob", lib.P["deskTop"], rough=0.5),
        bezel=lib.mat("Bezel", lib.P["monitorBezel"], rough=0.55),
        screen=lib.mat("Screen", lib.P["screenOff"], rough=0.4, emit=lib.P["screenGlow"]),
        kb=lib.mat("Keyboard", "#E9ECF2", rough=0.6),
        keys=lib.mat("Keys", "#FFFFFF", rough=0.5),
        mug=lib.mat("Mug", lib.P["claude"], rough=0.55),
        coffee=lib.mat("Coffee", lib.P["coffee"], rough=0.3),
    )


def desk(M):
    lib.rbox("Desk_Top", (1.40, 0.75, 0.07), (0, 0, TOP - 0.035), M["top"], r=0.032, seg=3)
    for s in (-1, 1):
        lib.rbox(f'Desk_Leg{"L" if s < 0 else "R"}', (0.08, 0.66, 0.67), (s * 0.6, 0, 0.365),
                 M["top"], r=0.035, seg=3)


def accents(M):
    lib.rbox("Desk_AccentPanel", (1.14, 0.05, 0.40), (0, 0.27, 0.46), M["accent"], r=0.022,
             seg=3)
    lib.rbox("Desk_Drawers", (0.36, 0.58, 0.30), (0.37, 0.0, 0.53), M["accent"], r=0.03, seg=3)
    lib.rbox("Desk_DrawerSeam", (0.33, 0.012, 0.012), (0.37, -0.293, 0.53), M["knob"],
             r=0.005, seg=1)
    for name, z in (("Top", 0.61), ("Bot", 0.45)):
        lib.sphere(f"Desk_DrawerKnob{name}", 0.022, (0.37, -0.29, z), M["knob"],
                   scale=(1, 0.7, 1), u=12, v=6)
    for s in (-1, 1):
        for t in (-1, 1):
            lib.cyl(f"Desk_Foot{s}{t}", 0.05, 0.03, (s * 0.6, t * 0.28, 0.015), M["accent"],
                    r=0.012, seg=2, verts=16)


def monitor(M):
    lib.cyl("Mon_Foot", 0.13, 0.035, (0, 0.14, TOP + 0.0175), M["bezel"], r=0.014, seg=2,
            verts=28)
    lib.rbox("Mon_Neck", (0.10, 0.06, 0.20), (0, 0.19, TOP + 0.12), M["bezel"], r=0.026, seg=2)
    lib.rbox("Mon_Bezel", (0.62, 0.11, 0.44), (0, 0.12, TOP + 0.40), M["bezel"], r=0.055,
             seg=4)
    lib.rbox("Mon_Hump", (0.42, 0.14, 0.30), (0, 0.20, TOP + 0.40), M["bezel"], r=0.06,
             seg=3)
    w, h = 0.53, 0.35
    bm = bmesh.new()
    vs = [bm.verts.new(v) for v in ((-w / 2, 0, -h / 2), (w / 2, 0, -h / 2),
                                    (w / 2, 0, h / 2), (-w / 2, 0, h / 2))]
    bm.faces.new(vs)  # normal faces -Y
    lib._link("Mon_Screen", bm, M["screen"], loc=(0, 0.12 - 0.056, TOP + 0.40))


def keyboard(M):
    kx, ky = -0.06, -0.19
    lib.rbox("Kb_Base", (0.44, 0.16, 0.03), (kx, ky, TOP + 0.015), M["kb"], r=0.012, seg=2)
    pitch, n = 0.034, 11
    for row in range(3):
        for i in range(n):
            lib.rbox(f"Kb_Key{row}_{i}", (0.027, 0.027, 0.016),
                     (kx + (i - (n - 1) / 2) * pitch, ky + 0.038 - row * 0.036, TOP + 0.034),
                     M["keys"], r=0.006, seg=1)
    lib.rbox("Kb_Space", (0.17, 0.027, 0.016), (kx, ky - 0.07, TOP + 0.034), M["keys"],
             r=0.006, seg=1)
    lib.blob("Mouse", 0.03, (0.27, -0.19, TOP + 0.018), M["kb"], scale=(0.95, 1.4, 0.6))


def mug(M):
    prof = [(0.0, 0.0), (0.036, 0.0), (0.042, 0.006), (0.044, 0.05), (0.044, 0.094),
            (0.040, 0.1), (0.036, 0.096), (0.036, 0.02), (0.0, 0.02)]
    mx, my = 0.5, 0.06
    lib.lathe("Mug_Body", prof, (mx, my, TOP), M["mug"], verts=24)
    lib.cyl("Mug_Coffee", 0.0365, 0.004, (mx, my, TOP + 0.082), M["coffee"], r=0, verts=24)
    lib.torus("Mug_Handle", 0.026, 0.009, (mx + 0.046, my, TOP + 0.052), M["mug"], seg=16,
              ring=8, rot=(math.pi / 2, 0, 0))


STEPS = [desk, accents, monitor, keyboard, mug]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
