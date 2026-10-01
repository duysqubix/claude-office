"""Party banner: a bunting garland of nine chunky pennants in alternating palette colours on
a gently sagging string between two wall pins. 1.6 m between the pins; wall item: origin
at the wall-contact point midway between the pins (the string's ends), front looks -Y."""
import math

import lib
from decor import _decor as D

NAME = "party_banner"
AO_RES = 512
AO_DISTANCE = 0.04
SPAN, SAG = 1.6, 0.13
N = 9
FW, FH = 0.16, 0.2
COLOURS = ["coral", "yellow", "sky", "mint", "lilac", "pink"]
META = dict(
    name="Party banner", category="decor", priority="P2",
    description="Bunting garland of nine colourful pennants on a sagging string",
    tags=["wall", "party", "birthday", "celebrate"], tintable=[],
    anchors_bl={"pinL": (-SPAN / 2, -0.01, 0), "pinR": (SPAN / 2, -0.01, 0)},
    mount="wall: origin is midway between the two pins (the string's ends), at the wall",
)


def string_z(x):
    """Sagging string height (a soft parabola)."""
    return -SAG * (1 - (2 * x / SPAN) ** 2)


def materials():
    M = {c: D.mat(f"Flag_{c}", c, rough=0.6) for c in COLOURS}
    M.update(string=D.mat("String", "paper", rough=0.7),
             pin=D.mat("Pin", "chrome", rough=0.3, metal=0.4),
             dot=D.mat("FlagDot", "paper", rough=0.6))
    return M


def build():
    lib.begin(NAME)
    M = materials()
    y = -0.012
    pts = [(x, y, string_z(x)) for x in [-SPAN / 2 + SPAN * k / 24 for k in range(25)]]
    D.tube("String", pts, 0.0035, M["string"], verts=6, caps="round")
    for s in (-1, 1):
        lib.cyl(f"Pin{s}", 0.004, 0.02, (s * SPAN / 2, -0.01, 0.0), M["pin"], r=0.001, seg=1,
                verts=8, rot=(math.pi / 2, 0, 0))
        lib.sphere(f"PinHead{s}", 0.008, (s * SPAN / 2, -0.021, 0.0), M["pin"], u=10, v=6)
    tri = D.rounded_pts([(-FW / 2, 0.0), (FW / 2, 0.0), (0.0, -FH)], 0.012, steps=3)
    for i in range(N):
        x = -SPAN / 2 + SPAN * (i + 1) / (N + 1)
        z = string_z(x)
        slope = math.atan(-SAG * (-8 * x / SPAN ** 2))
        before = D.snapshot()
        D.prism(f"Flag{i}", tri, 0.004, M[COLOURS[i % len(COLOURS)]], loc=(0, 0.002, 0.004),
                rot=D.FRONT, r=0.0015, seg=1)
        if i % 2 == 0:
            D.face(f"Flag{i}_Dot", D.circle_pts(0.016, 14), M["dot"], loc=(0, -0.0024, -FH * 0.38),
                   rot=D.FRONT)
        D.place(D.since(before), loc=(x, y, z), rot=(0, -slope, 0))


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META, wall=True)
