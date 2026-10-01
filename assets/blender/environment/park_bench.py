"""Park bench: chunky honey-wood slats on rounded deep-green iron side frames with armrests
and a middle brace. 1.6 m long, seat at 0.43 m. Origin at the floor centre; people sit
facing -Y."""
import math

import lib
from environment import _env

NAME = "park_bench"
AO_RES = 512
AO_DISTANCE = 0.25

L = 1.6
SEAT_Z = 0.43
IRON_R = 0.034
BACK_TILT = math.radians(14)


def materials():
    return dict(
        wood=lib.mat("Wood", lib.P["wood"], rough=0.6),
        iron=lib.mat("Iron", "#2F5D50", rough=0.5),
    )


def slats(M):
    for i, y in enumerate((-0.17, -0.02, 0.13)):
        lib.rbox(f"Seat{i}", (L, 0.13, 0.05), (0, y, SEAT_Z), M["wood"], r=0.022, seg=3)
    for i, z in enumerate((0.6, 0.76, 0.92)):
        y = 0.2 + (z - SEAT_Z) * math.tan(BACK_TILT)
        lib.rbox(f"Back{i}", (L, 0.045, 0.12), (0, y, z), M["wood"], r=0.02, seg=3,
                 rot=(-BACK_TILT, 0, 0))


def frame(M):
    for s in (-1, 1):
        x = s * (L / 2 - 0.12)
        side = "LR"[s > 0]
        # Front leg, seat rail, back leg rising into the back support.
        _env.tube(f"LegF{side}", (x, -0.2, 0.03), (x, -0.19, SEAT_Z - 0.03), IRON_R,
                  material=M["iron"], verts=12)
        _env.tube(f"LegB{side}", (x, 0.22, 0.03), (x, 0.17, SEAT_Z - 0.03), IRON_R,
                  material=M["iron"], verts=12)
        _env.tube(f"Rail{side}", (x, -0.25, SEAT_Z - 0.045), (x, 0.2, SEAT_Z - 0.045), IRON_R,
                  material=M["iron"], verts=12)
        top_y = 0.2 + (0.98 - SEAT_Z) * math.tan(BACK_TILT)
        _env.tube(f"BackPost{side}", (x, 0.18, SEAT_Z - 0.04), (x, top_y, 0.98), IRON_R,
                  material=M["iron"], verts=12)
        # Armrest on a curved-ish support.
        _env.tube(f"ArmPost{side}", (x, -0.2, SEAT_Z - 0.02), (x, -0.22, 0.63), IRON_R * 0.9,
                  material=M["iron"], verts=12)
        lib.rbox(f"Arm{side}", (0.09, 0.42, 0.05), (x, -0.02, 0.655), M["iron"], r=0.024, seg=3,
                 rot=(math.radians(-4), 0, 0))
        for y in (-0.2, 0.22):
            lib.sphere(f"Foot{side}{y}", 0.05, (x, y, 0.02), M["iron"], scale=(1, 1, 0.55),
                       u=12, v=6)
    # Middle brace under the seat so 1.6 m of slats don't look like they'd sag.
    _env.tube("Brace", (0, -0.24, SEAT_Z - 0.045), (0, 0.2, SEAT_Z - 0.045), IRON_R * 0.9,
              material=M["iron"], verts=10)
    _env.tube("BraceLeg", (0, 0.0, 0.03), (0, 0.0, SEAT_Z - 0.06), IRON_R * 0.9,
              material=M["iron"], verts=10)
    lib.sphere("BraceFoot", 0.045, (0, 0, 0.02), M["iron"], scale=(1, 1, 0.55), u=12, v=6)


def build():
    lib.begin(NAME)
    M = materials()
    slats(M)
    frame(M)


META = dict(
    name="Park bench",
    category="outdoor",
    priority="P0",
    description="Honey-wood slats on rounded deep-green iron frames with armrests",
    tags=["seating", "garden", "bench"],
    tintable=[],
    anchors={"seatL": [-0.45, 0.45, 0.02], "seatC": [0, 0.45, 0.02], "seatR": [0.45, 0.45, 0.02]},
    notes="Sitters face +Z; seat top at 0.455 m.",
)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META)
