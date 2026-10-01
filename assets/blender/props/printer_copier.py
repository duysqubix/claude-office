"""Printer / copier: a big friendly rounded copier. Cream body, coral accent stripe, lid with a
handle, a tilted control panel with a small glowing display and fat buttons, two paper
drawers, an output tray with a little stack of paper on the side. Front faces -Y."""
import math

import lib

NAME = "printer_copier"
AO_RES = 512
W, D, H = 0.72, 0.6, 0.98
META = dict(
    name="Printer copier", category="appliance", priority="P1",
    description="Big friendly copier with control panel, paper drawers and output tray",
    tags=["office", "appliance", "interactable"], tintable=["Accent"],
    anchors_bl={"output": (0.48, 0, 0.72), "panel": (0.18, -0.32, 0.98)},
)


def materials():
    return dict(
        body=lib.mat("Body", "#FFF3DE", rough=0.55),
        accent=lib.mat("Accent", "#FF7A6B", rough=0.5),
        dark=lib.mat("Dark", lib.P["chairBase"], rough=0.6),
        display=lib.mat("Display", "#1B2330", rough=0.4, emit=lib.P["stateWorking"],
                        strength=1.2),
        green=lib.mat("ButtonGo", lib.P["stateWorking"], rough=0.4),
        paper=lib.mat("Paper", "#FFFFFF", rough=0.8),
    )


def body(M):
    lib.rbox("PC_Body", (W, D, H - 0.12), (0, 0, 0.06 + (H - 0.12) / 2), M["body"], r=0.06,
             seg=3)
    lib.rbox("PC_Plinth", (W - 0.06, D - 0.06, 0.07), (0, 0, 0.035), M["dark"], r=0.02, seg=1)
    lib.rbox("PC_Stripe", (W + 0.004, D + 0.004, 0.05), (0, 0, 0.6), M["accent"], r=0.022,
             seg=2)
    lib.rbox("PC_Lid", (W - 0.02, D - 0.04, 0.06), (0, 0.01, H - 0.03), M["body"], r=0.025,
             seg=2)
    lib.rbox("PC_LidHandle", (0.2, 0.03, 0.025), (0, -D / 2 + 0.01, H - 0.035), M["dark"],
             r=0.01, seg=1)


def panel(M):
    tilt = math.radians(30)
    px, py, pz = 0.17, -D / 2 - 0.02, H - 0.1
    lib.rbox("PC_Panel", (0.32, 0.14, 0.05), (px, py, pz), M["dark"], r=0.02, seg=2,
             rot=(tilt, 0, 0))
    up = (0, -math.sin(tilt), math.cos(tilt))
    off = 0.028
    lib.rbox("PC_Display", (0.12, 0.07, 0.01), (px - 0.07, py + up[1] * off, pz + up[2] * off),
             M["display"], r=0.004, seg=1, rot=(tilt, 0, 0))
    for i in range(3):
        lib.sphere(f"PC_Btn{i}", 0.017, (px + 0.04 + i * 0.04, py + up[1] * off,
                   pz + up[2] * off), M["accent"] if i < 2 else M["green"],
                   scale=(1, 1, 0.6), u=12, v=6, rot=(tilt, 0, 0))


def drawers(M):
    for i, z in enumerate((0.42, 0.2)):
        lib.rbox(f"PC_Drawer{i}", (W - 0.08, 0.03, 0.18), (0, -D / 2 - 0.005, z), M["body"],
                 r=0.018, seg=2)
        lib.rbox(f"PC_Grip{i}", (0.18, 0.025, 0.03), (0, -D / 2 - 0.025, z + 0.05), M["dark"],
                 r=0.01, seg=1)


def output(M):
    lib.rbox("PC_Tray", (0.22, 0.34, 0.025), (W / 2 + 0.1, 0, 0.7), M["dark"], r=0.01, seg=1,
             rot=(0, math.radians(-8), 0))
    for i in range(3):
        lib.rbox(f"PC_Sheet{i}", (0.18, 0.27, 0.008), (W / 2 + 0.1, 0.0, 0.72 + i * 0.009),
                 M["paper"], r=0.003, seg=1, rot=(0, math.radians(-8), math.radians(i * 3)))


STEPS = [body, panel, drawers, output]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
