"""Fire hydrant: a chunky red barrel on a bolted flange with a sunny-yellow domed bonnet, a
pentagon top nut and three capped nozzles (the big one faces -Y). About 0.72 m tall.
Origin at the ground centre."""
import math

import lib
from environment import _env

NAME = "fire_hydrant"
AO_RES = 256
AO_DISTANCE = 0.12


def materials():
    return dict(
        red=lib.mat("Red", "#E63946", rough=0.45),
        cap=lib.mat("Cap", "#FFC93C", rough=0.45),
        bolt=lib.mat("Bolt", "#C8D0DC", rough=0.4, metal=0.4),
    )


def body(M):
    prof = [(0.0, 0.0), (0.17, 0.0), (0.18, 0.02), (0.17, 0.05), (0.125, 0.065), (0.115, 0.1),
            (0.11, 0.46), (0.125, 0.48), (0.135, 0.5), (0.0, 0.5)]
    lib.lathe("Barrel", prof, material=M["red"], verts=32)
    bonnet = [(0.0, 0.49), (0.14, 0.49), (0.145, 0.51), (0.13, 0.56), (0.09, 0.61),
              (0.04, 0.635), (0.0, 0.64)]
    lib.lathe("Bonnet", bonnet, material=M["cap"], verts=32)
    lib.cyl("TopNut", 0.04, 0.06, (0, 0, 0.665), M["cap"], r=0.008, seg=1, verts=5)
    for k in range(6):
        a = math.radians(30 + k * 60)
        lib.sphere(f"Bolt{k}", 0.016, (0.15 * math.cos(a), 0.15 * math.sin(a), 0.05),
                   M["bolt"], u=8, v=5)


def nozzles(M):
    for name, d, r, length in (("Pumper", (0, -1, 0), 0.06, 0.1),
                               ("SideL", (-1, 0, 0), 0.042, 0.08),
                               ("SideR", (1, 0, 0), 0.042, 0.08)):
        z = 0.36 if name == "Pumper" else 0.39
        base = (d[0] * 0.1, d[1] * 0.1, z)
        tip = (d[0] * (0.1 + length), d[1] * (0.1 + length), z)
        _env.tube(f"{name}Neck", base, tip, r, r, M["red"], verts=16, round_ends=False)
        cap_at = (d[0] * (0.1 + length + 0.015), d[1] * (0.1 + length + 0.015), z)
        rot = (math.pi / 2, 0, 0) if d[1] else (0, math.pi / 2, 0)
        lib.cyl(f"{name}Cap", r + 0.014, 0.04, cap_at, M["cap"], r=0.01, seg=2, verts=16,
                rot=rot)
        nut_at = (d[0] * (0.1 + length + 0.045), d[1] * (0.1 + length + 0.045), z)
        lib.cyl(f"{name}Nut", 0.022, 0.025, nut_at, M["cap"], r=0.005, seg=1, verts=5, rot=rot)


def build():
    lib.begin(NAME)
    M = materials()
    body(M)
    nozzles(M)


META = dict(
    name="Fire hydrant",
    category="outdoor",
    priority="P1",
    description=("Chunky red hydrant with a sunny-yellow domed bonnet, capped nozzles and a bolted "
                 "flange"),
    tags=["street", "garden"],
    tintable=[],
    anchors={},
)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META)
