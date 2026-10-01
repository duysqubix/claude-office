"""Manager desk: big chunky wooden desk with two drawer pedestals, gold knobs, a green
leather desk pad and a "MANAGER" brass nameplate facing visitors (+Y). The manager sits on
the -Y side (front); origin at the floor centre."""
import math

import lib

NAME = "manager_desk"
AO_RES = 512
TOP = 0.78
META = dict(
    name="Manager desk", category="furniture", priority="P0",
    description="Big wooden executive desk with brass nameplate and leather desk pad",
    tags=["desk", "manager"], tintable=[],
    anchors_bl={"top": (0, 0, TOP), "monitor": (0, 0.15, TOP), "keyboard": (0, -0.2, TOP),
                "mug": (0.6, -0.1, TOP), "chair": (0, -0.85, 0)},
)


def materials():
    return dict(
        wood=lib.mat("Wood", lib.P["wood"], rough=0.6),
        dark=lib.mat("WoodDark", "#A86F42", rough=0.65),
        gold=lib.mat("Gold", "#F2C14E", rough=0.35, metal=0.4),
        leather=lib.mat("Leather", "#2E8B57", rough=0.75),
        ink=lib.mat("Ink", lib.P["ink"], rough=0.6),
    )


def body(M):
    lib.rbox("MD_Top", (1.9, 0.92, 0.08), (0, 0, TOP - 0.04), M["wood"], r=0.035, seg=3)
    for s in (-1, 1):
        x = s * 0.66
        lib.rbox(f"MD_Ped{s}", (0.52, 0.80, 0.70), (x, 0, 0.37), M["dark"], r=0.035, seg=3)
        lib.rbox(f"MD_Plinth{s}", (0.48, 0.76, 0.05), (x, 0, 0.025), M["wood"], r=0.02, seg=2)
    lib.rbox("MD_Modesty", (0.84, 0.05, 0.50), (0, 0.36, 0.48), M["dark"], r=0.022, seg=3)


def drawers(M):
    for s in (-1, 1):
        x = s * 0.66
        for i, z in enumerate((0.60, 0.40, 0.18)):
            h = 0.17 if i < 2 else 0.22
            lib.rbox(f"MD_Drawer{s}{i}", (0.44, 0.03, h), (x, -0.405, z), M["wood"], r=0.014,
                     seg=2)
            lib.sphere(f"MD_Knob{s}{i}", 0.024, (x, -0.43, z), M["gold"], scale=(1, 0.8, 1),
                       u=12, v=6)


def top_details(M):
    lib.rbox("MD_Pad", (0.80, 0.46, 0.012), (0, -0.12, TOP + 0.006), M["leather"], r=0.006,
             seg=1)
    # Nameplate for visitors on the +Y side: dark wedge, brass plate, ink lettering.
    lib.rbox("MD_PlateBase", (0.34, 0.07, 0.06), (0, 0.36, TOP + 0.03), M["dark"], r=0.015,
             seg=2)
    lib.rbox("MD_Plate", (0.30, 0.012, 0.045), (0, 0.398, TOP + 0.038), M["gold"], r=0.004,
             seg=1)
    lib.text("MD_Name", "MANAGER", 0.03, (0, 0.406, TOP + 0.038), M["ink"],
             rot=(math.pi / 2, 0, math.pi), extrude=0, bevel=0, res=1)


STEPS = [body, drawers, top_details]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
