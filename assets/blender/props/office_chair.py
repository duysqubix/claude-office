"""Office chair: wheeled 5-star base, ribbed gas lift, plump two-tone seat and back,
stubby armrests. Seat material is `Seat` (PALETTE.chairs[0]) so the game can recolour it.
Front faces -Y; origin at the floor between the casters."""
import math

import lib

NAME = "office_chair"
AO_RES = 512


def materials():
    return dict(
        frame=lib.mat("Frame", lib.P["chairBase"], rough=0.6),
        chrome=lib.mat("Chrome", lib.P["metal"], rough=0.3, metal=0.4),
        wheel=lib.mat("Wheel", "#2E3440", rough=0.75),
        seat=lib.mat("Seat", lib.P["chairs"][0], rough=0.8),
    )


def base(M):
    lib.cyl("Base_Hub", 0.085, 0.10, (0, 0, 0.11), M["frame"], r=0.03, seg=2, verts=20)
    for i in range(5):
        a = math.radians(90 + i * 72)
        lib.rbox(f"Base_Spoke{i}", (0.32, 0.095, 0.07),
                 (0.17 * math.cos(a), 0.17 * math.sin(a), 0.105),
                 M["frame"], r=0.034, seg=2, rot=(0, 0, a))


def casters(M):
    for i in range(5):
        a = math.radians(90 + i * 72)
        x, y = 0.31 * math.cos(a), 0.31 * math.sin(a)
        lib.rbox(f"Caster_Fork{i}", (0.07, 0.08, 0.07), (x, y, 0.095), M["frame"], r=0.028,
                 seg=2, rot=(0, 0, a))
        # Oversized puck wheels, so round they read as balls from game distance.
        lib.cyl(f"Caster_Wheel{i}", 0.06, 0.07, (x, y, 0.06), M["wheel"], r=0.028, seg=3,
                verts=16, rot=(math.pi / 2, 0, a))


def gas_lift(M):
    lib.cyl("Lift_Piston", 0.04, 0.22, (0, 0, 0.27), M["chrome"], r=0.01, seg=1, verts=16)
    prof = [(0.0, 0.15), (0.06, 0.15)]
    for k in range(3):
        z = 0.16 + k * 0.045
        prof += [(0.07, z + 0.012), (0.058, z + 0.034)]
    prof += [(0.05, 0.30), (0.0, 0.30)]
    lib.lathe("Lift_Bellows", prof, material=M["frame"], verts=20)
    lib.rbox("Seat_Mech", (0.20, 0.20, 0.06), (0, 0, 0.35), M["frame"], r=0.025, seg=2)


def seat(M):
    lib.rbox("Seat_Shell", (0.54, 0.52, 0.05), (0, 0, 0.385), M["frame"], r=0.024, seg=2)
    # Marshmallow: a fat rounded box, subdivided so the edges bulge.
    c = lib.rbox("Seat_Cushion", (0.56, 0.54, 0.13), (0, -0.01, 0.46), M["seat"], r=0.06,
                 seg=2)
    lib.subsurf(c, 1)


def back(M):
    tilt = math.radians(-10)  # top leans back (+Y)
    lib.rbox("Back_PostLow", (0.10, 0.22, 0.045), (0, 0.18, 0.37), M["frame"], r=0.02, seg=2)
    lib.rbox("Back_Post", (0.10, 0.05, 0.30), (0, 0.27, 0.52), M["frame"], r=0.024, seg=2,
             rot=(tilt, 0, 0))
    lib.rbox("Back_Shell", (0.50, 0.06, 0.42), (0, 0.31, 0.80), M["frame"], r=0.028, seg=2,
             rot=(tilt, 0, 0))
    b = lib.rbox("Back_Cushion", (0.50, 0.13, 0.42), (0, 0.255, 0.805), M["seat"], r=0.06,
                 seg=2, rot=(tilt, 0, 0))
    lib.subsurf(b, 1)


def armrests(M):
    for s in (-1, 1):
        side = "L" if s < 0 else "R"
        lib.rbox(f"Arm_Bracket{side}", (0.13, 0.08, 0.04), (s * 0.26, 0.04, 0.37),
                 M["frame"], r=0.018, seg=2)
        lib.rbox(f"Arm_Post{side}", (0.06, 0.08, 0.22), (s * 0.31, 0.04, 0.48), M["frame"],
                 r=0.026, seg=2)
        lib.rbox(f"Arm_Pad{side}", (0.11, 0.26, 0.065), (s * 0.31, 0.02, 0.61), M["frame"],
                 r=0.03, seg=2)


STEPS = [base, casters, gas_lift, seat, back, armrests]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)
