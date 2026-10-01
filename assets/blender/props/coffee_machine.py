"""Coffee machine: plump retro espresso machine (coral body, cream plinth and cap), chrome
group head and drip tray, portafilter, pressure gauge, a glowing green `Light` (emissive),
steam wand, side knob, and an espresso cup on a saucer. Front faces -Y; origin at the
floor centre."""
import math

import lib

NAME = "coffee_machine"
AO_RES = 512


def materials():
    return dict(
        body=lib.mat("Body", "#FF7A6B", rough=0.55),
        cream=lib.mat("Cream", "#FFF3DE", rough=0.6),
        chrome=lib.mat("Chrome", lib.P["metal"], rough=0.28, metal=0.4),
        handle=lib.mat("Handle", lib.P["ink"], rough=0.6),
        light=lib.mat("Light", lib.P["stateWorking"], rough=0.3, emit=lib.P["stateWorking"],
                      strength=1.6),
        face=lib.mat("GaugeFace", "#FFFDF7", rough=0.5),
        cup=lib.mat("Cup", "#FFFFFF", rough=0.45),
        coffee=lib.mat("Coffee", lib.P["coffee"], rough=0.3),
    )


def blockout(M):
    lib.rbox("CM_Plinth", (0.42, 0.40, 0.06), (0, -0.02, 0.03), M["cream"], r=0.025, seg=3)
    lib.rbox("CM_Body", (0.36, 0.30, 0.40), (0, 0.03, 0.26), M["body"], r=0.06, seg=4)
    lib.rbox("CM_Head", (0.32, 0.16, 0.14), (0, -0.14, 0.38), M["body"], r=0.05, seg=4)
    lib.rbox("CM_Top", (0.38, 0.33, 0.05), (0, 0.0, 0.47), M["cream"], r=0.024, seg=3)


def brew(M):
    ch = M["chrome"]
    lib.cyl("CM_GroupHead", 0.055, 0.05, (0, -0.16, 0.29), ch, r=0.012, seg=2, verts=24)
    lib.cyl("CM_Basket", 0.05, 0.04, (0, -0.16, 0.25), ch, r=0.012, seg=2, verts=24)
    lib.rbox("CM_PFHandle", (0.036, 0.16, 0.036), (0, -0.28, 0.24), M["handle"], r=0.016,
             seg=2, rot=(math.radians(8), 0, 0))
    lib.rbox("CM_Tray", (0.30, 0.15, 0.035), (0, -0.20, 0.075), ch, r=0.014, seg=2)
    for i in range(4):
        lib.rbox(f"CM_TrayRidge{i}", (0.25, 0.012, 0.008), (0, -0.25 + i * 0.032, 0.094), ch,
                 r=0.004, seg=1)


def controls(M):
    ch = M["chrome"]
    face_on = (math.pi / 2, 0, 0)
    side_on = (0, math.pi / 2, 0)
    lib.cyl("CM_GaugeRing", 0.04, 0.025, (-0.09, -0.222, 0.385), ch, r=0.01, seg=2, verts=24,
            rot=face_on)
    lib.cyl("CM_GaugeFace", 0.03, 0.01, (-0.09, -0.236, 0.385), M["face"], r=0.003, seg=1,
            verts=24, rot=face_on)
    lib.rbox("CM_GaugeNeedle", (0.004, 0.004, 0.024), (-0.087, -0.242, 0.392), M["body"],
             r=0.0015, seg=1, rot=(0, math.radians(-35), 0))
    lib.cyl("CM_LightRim", 0.026, 0.02, (0.09, -0.222, 0.385), ch, r=0.007, seg=2, verts=20,
            rot=face_on)
    lib.sphere("CM_Light", 0.019, (0.09, -0.233, 0.385), M["light"], u=16, v=8)
    lib.cyl("CM_Knob", 0.045, 0.04, (0.2, 0.03, 0.30), M["cream"], r=0.015, seg=2, verts=24,
            rot=side_on)
    lib.cyl("CM_KnobCap", 0.02, 0.02, (0.225, 0.03, 0.30), ch, r=0.006, seg=1, verts=16,
            rot=side_on)
    lib.cyl("CM_WandJoint", 0.022, 0.03, (-0.19, -0.08, 0.36), ch, r=0.008, seg=1, verts=16,
            rot=side_on)
    lib.cyl("CM_Wand", 0.011, 0.20, (-0.215, -0.10, 0.27), ch, r=0, verts=12,
            rot=(math.radians(-12), 0, 0))
    lib.sphere("CM_WandTip", 0.016, (-0.215, -0.12, 0.17), ch, u=12, v=6)


def cup(M):
    z0 = 0.098
    lib.cyl("Cup_Saucer", 0.05, 0.012, (0, -0.17, z0 + 0.006), M["cup"], r=0.005, seg=2,
            verts=24)
    prof = [(0.0, 0.0), (0.022, 0.0), (0.03, 0.008), (0.036, 0.03), (0.037, 0.055),
            (0.034, 0.058), (0.031, 0.054), (0.03, 0.02), (0.0, 0.02)]
    lib.lathe("Cup_Body", prof, (0, -0.17, z0 + 0.012), M["cup"], verts=24)
    lib.cyl("Cup_Coffee", 0.031, 0.004, (0, -0.17, z0 + 0.058), M["coffee"], r=0, verts=24)
    lib.torus("Cup_Handle", 0.016, 0.006, (0.04, -0.17, z0 + 0.044), M["cup"], seg=12, ring=8,
              rot=(math.pi / 2, 0, 0))


STEPS = [blockout, brew, controls, cup]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)
