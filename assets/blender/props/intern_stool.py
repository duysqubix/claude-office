"""Intern stool: a small round stool sized for 0.7-scale interns. Plump `Seat` cushion on a
wooden disc and three chunky splayed legs, one shimmed with a folded paper wedge (it rocks).
Origin at the floor centre."""
import math

import lib

NAME = "intern_stool"
AO_RES = 256
H = 0.38
META = dict(
    name="Intern stool", category="furniture", priority="P0",
    description="Little round stool for interns",
    tags=["interns", "seating"], tintable=["Seat"], anchors_bl={"seat": (0, 0, H + 0.03)},
)


def materials():
    return dict(
        seat=lib.mat("Seat", lib.P["chairs"][2], rough=0.75),
        wood=lib.mat("Wood", "#E8BE84", rough=0.6),
        paper=lib.mat("Paper", "#FFFFFF", rough=0.8),
    )


def parts(M):
    prof = [(0.0, H - 0.03), (0.15, H - 0.03), (0.17, H - 0.01), (0.165, H + 0.02),
            (0.11, H + 0.04), (0.0, H + 0.045)]
    lib.lathe("IT_Cushion", prof, material=M["seat"], verts=24)
    lib.cyl("IT_Disc", 0.15, 0.03, (0, 0, H - 0.045), M["wood"], r=0.01, seg=1, verts=24)
    splay = math.radians(10)
    for i in range(3):
        a = math.radians(90 + i * 120)
        d = (math.cos(a), math.sin(a))
        short = 0.02 if i == 1 else 0.0
        lib.cyl(f"IT_Leg{i}", 0.026, H - 0.06 - short,
                (d[0] * 0.1, d[1] * 0.1, (H - 0.06 - short) / 2 + short), M["wood"],
                radius2=0.022, r=0.01, seg=1, verts=10, rot=(d[1] * splay, -d[0] * splay, 0))
        if short:
            lib.slab("IT_Shim", [(-0.03, 0), (0.03, 0), (0.0, 0.022)], -0.025, 0.025,
                     (d[0] * 0.15, d[1] * 0.15, 0), M["paper"], r=0.002, seg=1,
                     rot=(math.pi / 2, 0, a))


def build():
    lib.begin(NAME)
    parts(materials())


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
