"""Balloon cluster: five chunky party balloons (two in `Accent`, the rest a sunny mix) with
tied knots, curly strings gathering into a little gift-bag weight on the floor. Origin at
the floor centre. ~1.6 m tall."""
import math

from mathutils import Vector

import lib

NAME = "balloon_cluster"
AO_RES = 256
WEIGHT = Vector((0, 0, 0.0))
BALLOONS = [((-0.18, -0.04, 1.32), 0.17, "accent"), ((0.17, 0.02, 1.38), 0.16, "yellow"),
            ((0.0, 0.1, 1.58), 0.17, "accent"), ((-0.05, -0.17, 1.12), 0.15, "teal"),
            ((0.2, -0.14, 1.16), 0.15, "purple")]
META = dict(
    name="Balloon cluster", category="decor", priority="P2", artist="Claude Monet",
    description="Bunch of party balloons tied to a little weight",
    tags=["party", "event", "celebration"], tintable=["Accent"],
    anchors_bl={"top": (0, 0.1, 1.76)},
)


def materials():
    return dict(
        accent=lib.mat("Accent", "#FF5A5F", rough=0.25),
        yellow=lib.mat("BalloonYellow", "#FFD93D", rough=0.25),
        teal=lib.mat("BalloonTeal", "#2EC4B6", rough=0.25),
        purple=lib.mat("BalloonPurple", "#B983FF", rough=0.25),
        string=lib.mat("String", "#FFFFFF", rough=0.7),
        bag=lib.mat("Weight", "#4D96FF", rough=0.5),
        shine=lib.mat("Shine", "#FFFFFF", rough=0.2),
    )


def segment(name, a, b, r, mat):
    d = b - a
    lib.cyl(name, r, d.length, tuple((a + b) / 2), mat, r=0, verts=6,
            rot=d.to_track_quat("Z", "Y").to_euler())


def parts(M):
    lib.rbox("BC_Weight", (0.1, 0.1, 0.1), (0, 0, 0.05), M["bag"], r=0.025, seg=2)
    lib.torus("BC_WeightBow", 0.025, 0.008, (0, 0, 0.11), M["accent"], seg=12, ring=6,
              rot=(math.pi / 2, 0, 0))
    top = Vector((0, 0, 0.12))
    for i, (c, r, key) in enumerate(BALLOONS):
        c = Vector(c)
        lib.sphere(f"BC_Balloon{i}", r, tuple(c), M[key], scale=(1, 1, 1.15), u=20, v=12)
        lib.sphere(f"BC_Shine{i}", r * 0.18, tuple(c + Vector((-0.45 * r, -0.75 * r, 0.5 * r))),
                   M["shine"], scale=(1, 0.5, 1.4), u=8, v=4)
        knot = c - Vector((0, 0, r * 1.15 + 0.012))
        lib.cyl(f"BC_Knot{i}", 0.02, 0.03, tuple(knot), M[key], radius2=0.006, r=0, verts=10,
                rot=(math.pi, 0, 0))
        # Curly string: a gentle wave down to the weight.
        pts = []
        n = 8
        for k in range(n + 1):
            t = k / n
            p = knot.lerp(top, t)
            p.x += 0.025 * math.sin(t * math.pi * 3 + i)
            pts.append(p)
        for k in range(n):
            segment(f"BC_String{i}_{k}", pts[k], pts[k + 1], 0.004, M["string"])


def build():
    lib.begin(NAME)
    parts(materials())


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
