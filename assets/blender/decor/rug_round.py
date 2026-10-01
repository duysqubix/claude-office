"""Round rug: a soft 1.6 m round rug with a rolled edge and candy rings: tintable `Accent`
outer band, cream ring dotted with pink, a pink ring and a sunny centre. 0.014 m thick;
origin at the floor centre."""
import math

import lib
from decor import _decor as D

NAME = "rug_round"
AO_RES = 512
AO_DISTANCE = 0.04
R = 0.8
TOP = 0.014
# (outer radius, material) from the centre out.
RINGS = [(0.2, "sun"), (0.36, "pink"), (0.52, "cream"), (R, "accent")]
META = dict(
    name="Round rug", category="decor", priority="P1",
    description="Soft round rug with candy-coloured rings and a rolled edge",
    tags=["floor", "rug", "lounge"], tintable=["Accent"],
    anchors_bl={"center": (0, 0, TOP)},
)


def materials():
    return dict(
        accent=D.mat("Accent", "sky", rough=0.9),
        cream=D.mat("RugCream", "cream", rough=0.9),
        pink=D.mat("RugPink", "pink", rough=0.9),
        sun=D.mat("RugSun", "yellow", rough=0.9),
        dot=D.mat("RugDot", "coral", rough=0.9),
    )


def build():
    lib.begin(NAME)
    M = materials()
    prof = [(0.0, TOP)] + [(r, TOP) for r, _ in RINGS[:-1]] + [
        (R - 0.022, TOP), (R - 0.008, TOP - 0.002), (R, TOP - 0.007), (R - 0.004, 0.002),
        (R - 0.012, 0.0), (0.0, 0.0)]
    rug = D.lathe("Rug", prof, M["accent"], verts=64, sharp=50)
    inner = 0.0
    for r, key in RINGS[:-1]:
        lo = inner
        D.paint(rug, M[key], lambda c, n, lo=lo, r=r: n.z > 0.9 and abs(c.z - TOP) < 1e-4
                and lo <= math.hypot(c.x, c.y) < r)
        inner = r
    for k in range(18):
        a = 2 * math.pi * (k + 0.5) / 18
        rr = (RINGS[1][0] + RINGS[2][0]) / 2
        D.face(f"Dot{k}", D.circle_pts(0.028, 12), M["dot"],
               loc=(rr * math.cos(a), rr * math.sin(a), TOP + 0.0006))


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META)
