"""Party banner: bunting strung in a gentle sag across 2 m, with chunky triangular flags in a
rainbow (every other flag `Accent`) spelling P-A-R-T-Y-! in white rounded letters. Wall item:
origin at the centre between the two fixing points (the string's ends); flags face -Y."""
import math

from mathutils import Vector

import lib

NAME = "party_banner"
AO_RES = 256
SPAN, SAG = 2.0, 0.22
LETTERS = "PARTY!"
META = dict(
    name="Party banner", category="decor", priority="P2", artist="Claude Monet",
    description="Rainbow bunting banner spelling PARTY!",
    tags=["party", "event", "wall", "text"], tintable=["Accent"],
    anchors_bl={"left": (-SPAN / 2, -0.02, 0), "right": (SPAN / 2, -0.02, 0)},
    mount="wall: origin is midway between the two fixing points",
)


def materials():
    return dict(
        string=lib.mat("String", "#FFFFFF", rough=0.7),
        letters=lib.mat("Letters", "#FFFFFF", rough=0.5),
        pins=lib.mat("Pin", "#2B2D42", rough=0.5),
        flags=[lib.mat("Accent", "#FF5A5F", rough=0.6), lib.mat("FlagYellow", "#FFD93D", rough=0.6),
               lib.mat("FlagGreen", "#6BCB77", rough=0.6), lib.mat("FlagBlue", "#4D96FF", rough=0.6),
               lib.mat("FlagPurple", "#B983FF", rough=0.6), lib.mat("FlagOrange", "#FF9F45",
                                                                      rough=0.6)],
    )


def sag(x):
    return -SAG * (1 - (2 * x / SPAN) ** 2)


def parts(M):
    n = 24
    pts = [Vector((-SPAN / 2 + SPAN * k / n, -0.02, sag(-SPAN / 2 + SPAN * k / n)))
           for k in range(n + 1)]
    for k in range(n):
        d = pts[k + 1] - pts[k]
        lib.cyl(f"PB_String{k}", 0.006, d.length, tuple((pts[k] + pts[k + 1]) / 2), M["string"],
                r=0, verts=6, rot=d.to_track_quat("Z", "Y").to_euler())
    for s in (-1, 1):
        lib.sphere(f"PB_Pin{s}", 0.02, (s * SPAN / 2, -0.02, 0), M["pins"], u=10, v=5)
    m = len(LETTERS)
    for i, ch in enumerate(LETTERS):
        x = -SPAN / 2 + SPAN * (i + 0.5) / m
        z = sag(x)
        slope = math.atan(-8 * SAG * x / SPAN ** 2)
        w, h = 0.24, 0.3
        flag = lib.slab(f"PB_Flag{i}", [(-w / 2, 0), (0, -h), (w / 2, 0)], -0.005, 0.005,
                        (x, -0.02, z - 0.008), M["flags"][i % len(M["flags"])], r=0.004, seg=1,
                        rot=(math.pi / 2, slope, 0))
        lib.text(f"PB_Letter{i}", ch, 0.11, (x + math.sin(slope) * 0.0, -0.027, z - 0.1),
                 M["letters"], extrude=0, bevel=0, res=2, rot=(math.pi / 2, slope, 0))


def build():
    lib.begin(NAME)
    parts(materials())


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
