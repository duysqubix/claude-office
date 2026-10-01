"""Manager chair: tall, puffy executive chair. Chrome 5-star base with fat casters, a thick
marshmallow seat, a high back made of stacked tufted pillow rolls plus a headrest, and
padded arms. Cushions use `Seat` (deep leather red). Front faces -Y; origin at the floor."""
import math

import lib
from props import office_chair

NAME = "manager_chair"
AO_RES = 512
META = dict(
    name="Manager chair", category="furniture", priority="P0",
    description="Tall puffy executive chair with stacked pillow-roll back",
    tags=["seating", "manager"], tintable=["Seat"],
    anchors_bl={"seat": (0, -0.03, 0.54)},
)


def materials():
    chrome = lib.mat("Chrome", lib.P["metal"], rough=0.28, metal=0.4)
    return dict(
        frame=chrome, chrome=chrome,
        wheel=lib.mat("Wheel", "#2E3440", rough=0.75),
        shell=lib.mat("Frame", lib.P["chairBase"], rough=0.6),
        seat=lib.mat("Seat", "#B5404F", rough=0.6),
    )


def base(M):
    office_chair.base(M)
    office_chair.casters(M)
    office_chair.gas_lift(M)


def seat(M):
    lib.rbox("Seat_Shell", (0.60, 0.56, 0.05), (0, 0, 0.385), M["shell"], r=0.024, seg=2)
    c = lib.rbox("Seat_Cushion", (0.64, 0.60, 0.16), (0, -0.02, 0.475), M["seat"], r=0.07,
                 seg=1)
    lib.subsurf(c, 1)


def back(M):
    tilt = math.radians(-12)
    lib.rbox("Back_PostLow", (0.12, 0.26, 0.05), (0, 0.2, 0.37), M["shell"], r=0.022, seg=2)
    lib.rbox("Back_Shell", (0.60, 0.07, 0.90), (0, 0.39, 0.96), M["shell"], r=0.03, seg=2,
             rot=(tilt, 0, 0))
    sin_t, cos_t = math.sin(-tilt), math.cos(-tilt)
    for i, zc in enumerate((0.64, 0.84, 1.04)):
        # Slide each roll up the tilted back plane; rolls overlap so they read as tufting.
        y = 0.33 + (zc - 0.64) * sin_t / cos_t
        r = lib.rbox(f"Back_Roll{i}", (0.58, 0.17, 0.26), (0, y, zc), M["seat"], r=0.08,
                     seg=1, rot=(tilt, 0, 0))
        lib.subsurf(r, 1)
    h = lib.rbox("Back_Headrest", (0.46, 0.16, 0.20), (0, 0.33 + 0.6 * sin_t / cos_t, 1.24),
                 M["seat"], r=0.07, seg=1, rot=(tilt, 0, 0))
    lib.subsurf(h, 1)

def arms(M):
    for s in (-1, 1):
        lib.rbox(f"Arm_Bracket{s}", (0.13, 0.08, 0.04), (s * 0.29, 0.06, 0.38), M["shell"],
                 r=0.018, seg=2)
        lib.rbox(f"Arm_Post{s}", (0.06, 0.08, 0.24), (s * 0.35, 0.06, 0.5), M["frame"],
                 r=0.026, seg=2)
        p = lib.rbox(f"Arm_Pad{s}", (0.13, 0.40, 0.09), (s * 0.35, 0.02, 0.66), M["seat"],
                     r=0.04, seg=1)
        lib.subsurf(p, 1)


STEPS = [base, seat, back, arms]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
