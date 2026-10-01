"""Conference chair: puffy tub chair on a swivel pedestal. A white rounded tub shell that
wraps the back and sides, a plump `Seat` cushion and a padded back roll, on a chrome column
and disc foot. Front faces -Y; origin at the floor centre."""
import math

import lib

NAME = "conference_chair"
AO_RES = 256
SEAT_Z = 0.46
META = dict(
    name="Conference chair", category="furniture", priority="P0",
    description="Puffy swivel tub chair for the Team Room",
    tags=["seating", "team-room", "meeting-room"], tintable=["Seat"],
    anchors_bl={"seat": (0, -0.02, SEAT_Z + 0.06)},
)


def materials():
    return dict(
        shell=lib.mat("Shell", "#F4F7FB", rough=0.45),
        seat=lib.mat("Seat", lib.P["chairs"][1], rough=0.75),
        chrome=lib.mat("Chrome", lib.P["metal"], rough=0.28, metal=0.4),
    )


def pedestal(M):
    lib.cyl("CC_Foot", 0.27, 0.04, (0, 0, 0.02), M["chrome"], r=0.018, seg=2, verts=28)
    lib.cyl("CC_Column", 0.04, 0.3, (0, 0, 0.19), M["chrome"], r=0.01, seg=1, verts=16)


def tub(M):
    # Thick wall spun around the back: open toward -Y (angles measured from +X, CCW).
    prof = [(0.27, SEAT_Z - 0.08), (0.33, SEAT_Z - 0.08), (0.35, SEAT_Z + 0.1),
            (0.34, SEAT_Z + 0.36), (0.3, SEAT_Z + 0.4), (0.27, SEAT_Z + 0.36),
            (0.27, SEAT_Z - 0.08)]
    lib.lathe("CC_Tub", prof, material=M["shell"], verts=22, sweep=math.radians(230),
              start=math.radians(-25))
    lib.cyl("CC_Pan", 0.33, 0.07, (0, 0, SEAT_Z - 0.05), M["shell"], r=0.025, seg=2, verts=28)


def cushions(M):
    prof = [(0.0, SEAT_Z - 0.02), (0.27, SEAT_Z - 0.02), (0.3, SEAT_Z + 0.02),
            (0.29, SEAT_Z + 0.07), (0.22, SEAT_Z + 0.1), (0.0, SEAT_Z + 0.11)]
    lib.lathe("CC_Cushion", prof, material=M["seat"], verts=28)
    roll = lib.torus("CC_BackRoll", 0.24, 0.065, (0, 0, SEAT_Z + 0.24), M["seat"], seg=20,
                     ring=10, sweep=math.radians(200), rot=(0, 0, math.radians(-10)))
    roll.scale = (1, 1, 1.6)


STEPS = [pedestal, tub, cushions]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
