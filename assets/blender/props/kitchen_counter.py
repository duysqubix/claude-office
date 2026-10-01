"""Kitchen counter: cream cabinet run with three tintable `Accent` doors and round knobs, a
chunky honey-wood worktop, a chrome sink with a gooseneck faucet. Front faces -Y; origin at
the floor centre."""
import math

import lib

NAME = "kitchen_counter"
AO_RES = 512
W, D, TOP = 1.6, 0.62, 0.92
META = dict(
    name="Kitchen counter", category="furniture", priority="P0",
    description="Cabinet run with worktop, sink and gooseneck faucet",
    tags=["kitchen", "break-room"], tintable=["Accent"],
    anchors_bl={"top": (-0.35, -0.05, TOP), "sink": (0.35, -0.02, TOP)},
)


def materials():
    return dict(
        body=lib.mat("Cabinet", "#FFF3DE", rough=0.6),
        doors=lib.mat("Accent", "#8FE0C8", rough=0.55),
        top=lib.mat("Worktop", "#E8BE84", rough=0.55),
        knob=lib.mat("Knob", lib.P["deskTop"], rough=0.45),
        chrome=lib.mat("Chrome", lib.P["metal"], rough=0.25, metal=0.4),
        basin=lib.mat("Basin", "#9AA7B8", rough=0.4, metal=0.2),
        base=lib.mat("Base", lib.P["chairBase"], rough=0.7),
    )


def cabinets(M):
    lib.rbox("KC_Body", (W, D - 0.04, TOP - 0.16), (0, 0.02, 0.1 + (TOP - 0.16) / 2), M["body"],
             r=0.035, seg=3)
    lib.rbox("KC_Plinth", (W - 0.08, D - 0.14, 0.1), (0, 0.04, 0.05), M["base"], r=0.02, seg=1)
    for i in range(3):
        x = (i - 1) * 0.52
        lib.rbox(f"KC_Door{i}", (0.48, 0.035, 0.62), (x, -D / 2 + 0.01, 0.45), M["doors"],
                 r=0.025, seg=2)
        kx = x + (0.17 if i < 2 else -0.17)
        lib.sphere(f"KC_Knob{i}", 0.025, (kx, -D / 2 - 0.02, 0.66), M["knob"],
                   scale=(1, 0.8, 1), u=12, v=6)


def worktop(M):
    lib.rbox("KC_Top", (W + 0.06, D + 0.04, 0.07), (0, 0, TOP - 0.035), M["top"], r=0.03, seg=3)
    lib.rbox("KC_SinkRim", (0.54, 0.40, 0.016), (0.35, -0.02, TOP + 0.008), M["chrome"],
             r=0.008, seg=1)
    lib.rbox("KC_Basin", (0.46, 0.32, 0.01), (0.35, -0.02, TOP + 0.013), M["basin"], r=0.004,
             seg=1)
    lib.rbox("KC_Drain", (0.05, 0.05, 0.004), (0.35, -0.02, TOP + 0.019), M["base"], r=0.002,
             seg=1)


def faucet(M):
    fx, fy, major = 0.35, 0.23, 0.08
    lib.cyl("KC_FaucetBase", 0.035, 0.03, (fx, fy, TOP + 0.015), M["chrome"], r=0.01, seg=1,
            verts=16)
    lib.cyl("KC_FaucetRiser", 0.02, 0.22, (fx, fy, TOP + 0.13), M["chrome"], r=0, verts=12)
    lib.torus("KC_FaucetNeck", major, 0.02, (fx, fy - major, TOP + 0.24), M["chrome"], seg=14,
              ring=10, rot=(math.pi / 2, 0, math.pi / 2), sweep=math.pi)
    lib.cyl("KC_FaucetTip", 0.024, 0.04, (fx, fy - 2 * major, TOP + 0.225), M["chrome"],
            r=0.008, seg=1, verts=12)
    for s in (-1, 1):
        lib.sphere(f"KC_Tap{s}", 0.022, (fx + s * 0.08, fy, TOP + 0.03), M["chrome"], u=12, v=6)


STEPS = [cabinets, worktop, faucet]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
