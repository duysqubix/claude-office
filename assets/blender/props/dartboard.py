"""Dartboard (wall-mounted): a chunky round board with alternating red/green and cream/dark
wedges, double and treble rings, a bullseye, a fat black number ring, and three darts stuck
in it. Origin at the wall-contact point (back centre); it faces -Y."""
import math

import lib

NAME = "dartboard"
AO_RES = 256
R = 0.24
META = dict(
    name="Dartboard", category="decor", priority="P1",
    description="Wall dartboard with three darts stuck in",
    tags=["game-room", "fun", "wall"], tintable=[], anchors_bl={"bull": (0, -0.06, 0)},
    mount="wall: origin is the back centre (bull ≈ 1.73 m up)",
)


def materials():
    return dict(
        rim=lib.mat("Rim", "#2B2D42", rough=0.6),
        dark=lib.mat("Dark", "#3B3B4F", rough=0.8),
        cream=lib.mat("Cream", "#FFF3DE", rough=0.8),
        red=lib.mat("Red", "#E63946", rough=0.7),
        green=lib.mat("Green", "#2E9E5B", rough=0.7),
        brass=lib.mat("Brass", "#F2C14E", rough=0.35, metal=0.4),
        flight=lib.mat("Flight", lib.P["deskAccents"][2], rough=0.5),
    )


def board(M):
    face_on = (math.pi / 2, 0, 0)
    lib.cyl("DB_Rim", R + 0.06, 0.05, (0, -0.025, 0), M["rim"], r=0.02, seg=2, verts=40,
            rot=face_on)
    # Rings: (inner, outer, colours for odd/even wedges, y offset).
    rings = [(0.0, 0.16, (M["dark"], M["cream"]), 0.0), (0.16, 0.175, (M["red"], M["green"]),
             0.002), (0.175, 0.225, (M["dark"], M["cream"]), 0.0),
             (0.225, 0.24, (M["red"], M["green"]), 0.002)]
    for ri, (r0, r1, mats, dy) in enumerate(rings):
        for w in range(20):
            a0 = math.radians(-9 + w * 18)
            # Arc lives in XY; rotate so it faces -Y and sits on the board surface.
            lib.arc(f"DB_W{ri}_{w}", max(r0, 0.03 if ri == 0 else r0), r1, a0,
                    a0 + math.radians(18), -0.004, 0.004, (0, -0.054 - dy, 0), mats[w % 2],
                    segs=2, r=0, rot=face_on)
    lib.cyl("DB_Outer", 0.03, 0.01, (0, -0.056, 0), M["green"], r=0.002, seg=1, verts=16,
            rot=face_on)
    lib.cyl("DB_Bull", 0.013, 0.012, (0, -0.058, 0), M["red"], r=0.002, seg=1, verts=12,
            rot=face_on)


def darts(M):
    for i, (x, z, tilt) in enumerate(((0.05, 0.03, 8), (-0.09, -0.06, -6), (0.02, -0.13, 4))):
        rot = (math.pi / 2 + math.radians(tilt), 0, 0)
        lib.cyl(f"DB_Barrel{i}", 0.008, 0.07, (x, -0.1, z), M["brass"], r=0.003, seg=1, verts=8,
                rot=rot)
        lib.cyl(f"DB_Shaft{i}", 0.004, 0.05, (x, -0.155, z), M["rim"], r=0, verts=6, rot=rot)
        for k in range(2):
            lib.rbox(f"DB_Flight{i}_{k}", (0.004 if k else 0.05, 0.04, 0.05 if k else 0.004),
                     (x, -0.18, z), M["flight"], r=0.0015, seg=1)


STEPS = [board, darts]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
