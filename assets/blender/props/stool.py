"""Stool: plump round `Seat` cushion on four splayed wooden legs with a chunky foot ring.
Origin at the floor centre."""
import math

import lib

NAME = "stool"
AO_RES = 256
H = 0.66
META = dict(
    name="Stool", category="furniture", priority="P1",
    description="Wooden stool with a plump round cushion and a foot ring",
    tags=["seating", "kitchen", "break-room"], tintable=["Seat"],
    anchors_bl={"seat": (0, 0, H)},
)


def materials():
    return dict(
        seat=lib.mat("Seat", lib.P["chairs"][0], rough=0.75),
        wood=lib.mat("Wood", lib.P["wood"], rough=0.6),
    )


def parts(M):
    prof = [(0.0, H - 0.07), (0.17, H - 0.07), (0.195, H - 0.05), (0.2, H - 0.02),
            (0.185, H + 0.0), (0.12, H + 0.015), (0.0, H + 0.02)]
    lib.lathe("ST_Cushion", prof, material=M["seat"], verts=28)
    lib.cyl("ST_Plate", 0.17, 0.035, (0, 0, H - 0.085), M["wood"], r=0.012, seg=2, verts=28)
    splay = math.radians(7)
    for i in range(4):
        a = math.radians(45 + i * 90)
        d = (math.cos(a), math.sin(a))
        lib.cyl(f"ST_Leg{i}", 0.026, H - 0.08, (d[0] * 0.15, d[1] * 0.15, (H - 0.08) / 2),
                M["wood"], radius2=0.022, r=0.01, seg=1, verts=12,
                rot=(d[1] * splay, -d[0] * splay, 0))
    lib.torus("ST_Ring", 0.17, 0.016, (0, 0, 0.22), M["wood"], seg=28, ring=8)


def build():
    lib.begin(NAME)
    parts(materials())


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
