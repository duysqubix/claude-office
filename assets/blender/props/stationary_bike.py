"""Stationary bike: chunky exercise bike. Two fat floor feet, a curved `Accent` frame, a big
flywheel up front, a puffy `Seat` saddle on a post, handlebars with a tiny glowing display,
and crank pedals. Front (handlebars) faces -Y; origin at the floor centre."""
import math

from mathutils import Vector

import lib

NAME = "stationary_bike"
AO_RES = 256
META = dict(
    name="Stationary bike", category="furniture", priority="P2",
    description="Chunky exercise bike with flywheel and glowing display",
    tags=["gym", "fun", "wellness"], tintable=["Accent", "Seat"],
    anchors_bl={"seat": (0, 0.28, 0.82), "handles": (0, -0.36, 1.0), "pedals": (0, 0.0, 0.3)},
)


def materials():
    return dict(
        frame=lib.mat("Accent", "#FF5A5F", rough=0.45),
        dark=lib.mat("Dark", lib.P["chairBase"], rough=0.55),
        seat=lib.mat("Seat", lib.P["ink"], rough=0.7),
        chrome=lib.mat("Chrome", lib.P["metal"], rough=0.25, metal=0.4),
        screen=lib.mat("Display", "#1B2330", rough=0.4, emit=lib.P["stateWorking"],
                       strength=1.4),
        grip=lib.mat("Grip", "#2B2D42", rough=0.8),
    )


def bar(name, a, b, r, mat):
    a, b = Vector(a), Vector(b)
    d = b - a
    lib.cyl(name, r, d.length, tuple((a + b) / 2), mat, r=r * 0.4, seg=1, verts=14,
            rot=d.to_track_quat("Z", "Y").to_euler())


def parts(M):
    for i, y in enumerate((-0.42, 0.42)):
        lib.rbox(f"SB_Foot{i}", (0.5, 0.08, 0.06), (0, y, 0.03), M["dark"], r=0.028, seg=2)
    bar("SB_Spine", (0, 0.42, 0.06), (0, -0.3, 0.06), 0.035, M["frame"])
    bar("SB_SeatTube", (0, 0.1, 0.1), (0, 0.26, 0.72), 0.04, M["frame"])
    bar("SB_DownTube", (0, -0.3, 0.1), (0, -0.34, 0.9), 0.04, M["frame"])
    bar("SB_Cross", (0, 0.12, 0.3), (0, -0.32, 0.55), 0.035, M["frame"])
    lib.cyl("SB_Flywheel", 0.2, 0.08, (0, -0.22, 0.3), M["dark"], r=0.025, seg=2, verts=28,
            rot=(0, math.pi / 2, 0))
    lib.cyl("SB_FlyHub", 0.07, 0.1, (0, -0.22, 0.3), M["chrome"], r=0.015, seg=1, verts=16,
            rot=(0, math.pi / 2, 0))
    s = lib.rbox("SB_Saddle", (0.22, 0.3, 0.08), (0, 0.28, 0.8), M["seat"], r=0.035, seg=1)
    lib.subsurf(s, 1)
    lib.rbox("SB_Console", (0.2, 0.08, 0.13), (0, -0.37, 0.98), M["dark"], r=0.03, seg=2,
             rot=(math.radians(25), 0, 0))
    lib.rbox("SB_Display", (0.14, 0.01, 0.07), (0, -0.405, 0.995), M["screen"], r=0.004, seg=1,
             rot=(math.radians(25), 0, 0))
    lib.torus("SB_Handlebar", 0.18, 0.018, (0, -0.3, 0.94), M["chrome"], seg=14, ring=8,
              sweep=math.pi, rot=(0, 0, math.pi))
    for s in (-1, 1):
        lib.cyl(f"SB_Grip{s}", 0.025, 0.12, (s * 0.18, -0.24, 0.94), M["grip"], r=0.01, seg=1,
                verts=12, rot=(math.pi / 2, 0, 0))
        lib.rbox(f"SB_Crank{s}", (0.03, 0.03, 0.16), (s * 0.08, 0.05, 0.28), M["chrome"],
                 r=0.012, seg=1, rot=(math.radians(30) * s, 0, 0))
        lib.rbox(f"SB_Pedal{s}", (0.1, 0.06, 0.025), (s * 0.12, 0.05 + s * 0.04, 0.28 - s * 0.07),
                 M["dark"], r=0.01, seg=1)
    lib.cyl("SB_BB", 0.05, 0.12, (0, 0.05, 0.28), M["frame"], r=0.015, seg=1, verts=14,
            rot=(0, math.pi / 2, 0))


def build():
    lib.begin(NAME)
    parts(materials())


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
