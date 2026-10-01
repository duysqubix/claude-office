"""Balloon cluster: five glossy party balloons (red, yellow, blue, mint, pink) with tied
knots and cartoon shine spots, on curly-ish strings gathered at a chunky heart weight.
1.62 m tall; origin at the floor-contact centre of the weight."""
import math

from mathutils import Vector

import lib
from decor import _decor as D

NAME = "balloon_cluster"
AO_RES = 512
AO_DISTANCE = 0.08
# (x, y, z of the balloon centre, radius, material, lean in degrees)
BALLOONS = [(0.0, 0.07, 1.52, 0.15, "red", 0), (-0.22, 0.0, 1.4, 0.14, "yellow", -12),
            (0.22, 0.04, 1.42, 0.14, "blue", 12), (0.11, -0.15, 1.25, 0.13, "mint", 8),
            (-0.13, -0.12, 1.22, 0.13, "pink", -8)]
TIE = Vector((0, 0, 0.12))
META = dict(
    name="Balloon cluster", category="decor", priority="P2",
    description="Bunch of five glossy party balloons on strings, weighted by a heart",
    tags=["party", "birthday", "celebrate"], tintable=[],
    anchors_bl={"top": (0, 0, 1.62)},
)


def materials():
    return dict(
        red=D.mat("BalloonRed", "red", rough=0.22),
        yellow=D.mat("BalloonYellow", "yellow", rough=0.22),
        blue=D.mat("BalloonBlue", "blue", rough=0.22),
        mint=D.mat("BalloonMint", "mint", rough=0.22),
        pink=D.mat("BalloonPink", "pink", rough=0.22),
        shine=D.mat("Shine", "paper", rough=0.3),
        string=D.mat("String", "paper2", rough=0.7),
        weight=D.mat("Weight", "coral", rough=0.35, metal=0.15),
    )


def balloon(M, i, x, y, z, r, key, lean):
    c = Vector((x, y, z))
    tilt = math.radians(lean)
    lib.sphere(f"Balloon{i}", r, tuple(c), M[key], u=22, v=13, scale=(0.93, 0.93, 1.1),
               rot=(0, tilt, 0))
    down = Vector((-math.sin(tilt), 0, -math.cos(tilt)))
    knot = c + down * (r * 1.1 + 0.004)
    lib.cyl(f"Knot{i}", 0.014, 0.022, tuple(knot), M[key], r=0.004, seg=1, verts=10,
            radius2=0.006, rot=(0, math.pi + tilt, 0))
    # Shine spot up and to the front-left.
    s = (Vector((-0.45, -0.6, 0.55))).normalized()
    lib.sphere(f"Shine{i}", r * 0.17, tuple(c + Vector((s.x * r * 0.93, s.y * r * 0.93,
                                                        s.z * r * 1.1)) * 0.97),
               M["shine"], u=10, v=6, scale=(1, 0.45, 1.35), rot=s.to_track_quat("Y", "Z").to_euler())
    return knot + down * 0.012


def build():
    lib.begin(NAME)
    M = materials()
    for i, (x, y, z, r, key, lean) in enumerate(BALLOONS):
        end = balloon(M, i, x, y, z, r, key, lean)
        mid = end.lerp(TIE, 0.5) + Vector((0.025 * (1 if i % 2 else -1), 0.0, 0.0))
        D.tube(f"String{i}", [tuple(end), tuple(mid), tuple(TIE + Vector((0, 0, 0.004)))],
               0.0022, M["string"], verts=5, smooth=4, caps="round")
    D.prism("Weight", D.heart_pts(0.13, 28), 0.05, M["weight"], loc=(0, 0.025, 0.065),
            rot=(math.pi / 2, 0, 0), r=0.009, seg=2)
    lib.torus("Weight_Ring", 0.012, 0.003, tuple(TIE), M["string"], seg=12, ring=4,
              rot=(math.pi / 2, 0, 0))
    D.ground()  # the heart weight rests on the floor


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META)
