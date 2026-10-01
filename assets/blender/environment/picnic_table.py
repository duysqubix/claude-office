"""Picnic table: a classic A-frame table with two attached benches: five chunky honey planks
on top, two per bench, splayed darker legs and braces. 1.8 × 1.6 m, top at 0.76 m. Origin at
the ground centre; benches run along X."""
import math

import lib
from environment import _env

NAME = "picnic_table"
AO_RES = 512
AO_DISTANCE = 0.25

L = 1.8
TOP_Z = 0.76
BENCH_Z = 0.45
BENCH_Y = 0.62


def materials():
    return dict(
        plank=lib.mat("Wood", lib.P["wood"], rough=0.6),
        frame=lib.mat("WoodDark", "#A9733F", rough=0.65),
    )


def planks(M):
    for i in range(5):
        y = (i - 2) * 0.165
        lib.rbox(f"Top{i}", (L, 0.15, 0.05), (0, y, TOP_Z - 0.025), M["plank"], r=0.02, seg=3)
    for sgn in (-1, 1):
        for i in range(2):
            y = sgn * (BENCH_Y + (i - 0.5) * 0.16)
            lib.rbox(f"Bench{sgn}{i}", (L, 0.145, 0.05), (0, y, BENCH_Z - 0.025), M["plank"],
                     r=0.02, seg=3)


def frame(M):
    for sx in (-1, 1):
        x = sx * (L / 2 - 0.25)
        lib.rbox(f"TopCleat{sx}", (0.07, 0.8, 0.06), (x, 0, TOP_Z - 0.08), M["frame"], r=0.02,
                 seg=2)
        lib.rbox(f"BenchRail{sx}", (0.07, 2 * BENCH_Y + 0.36, 0.07), (x, 0, BENCH_Z - 0.085),
                 M["frame"], r=0.022, seg=2)
        for sy in (-1, 1):
            # Splayed A-frame leg from the ground up under the table top.
            foot = (x, sy * 0.68, 0.02)
            top = (x, sy * 0.2, TOP_Z - 0.1)
            d = (top[1] - foot[1], top[2] - foot[2])
            length = math.hypot(*d)
            mid = (x, (foot[1] + top[1]) / 2, (foot[2] + top[2]) / 2)
            lib.rbox(f"Leg{sx}{sy}", (0.08, 0.08, length), mid, M["frame"], r=0.025, seg=2,
                     rot=(math.atan2(-d[0], d[1]) if False else -math.atan2(d[0], d[1]), 0, 0))
        # Brace from the bench rail to the middle of the top.
    for sx in (-1, 1):
        _env.tube(f"Brace{sx}", (sx * (L / 2 - 0.25), 0, BENCH_Z - 0.12), (0, 0, TOP_Z - 0.09),
                  0.025, material=M["frame"], verts=8)


def build():
    lib.begin(NAME)
    M = materials()
    planks(M)
    frame(M)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE)
