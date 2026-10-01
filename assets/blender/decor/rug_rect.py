"""Rectangular rug: a soft 2 × 1.3 m rug with a tintable `Accent` field, a cream border,
three big diamonds down the middle, a scatter of dots, and chunky tassels on the short
ends. 0.012 m thick; origin at the floor centre; long axis along X."""
import math

import lib
from decor import _decor as D

NAME = "rug_rect"
AO_RES = 512
AO_DISTANCE = 0.04
RW, RD, T = 2.0, 1.3, 0.012
META = dict(
    name="Rectangular rug", category="decor", priority="P1",
    description="Soft rectangular rug with a border, big diamonds and tassels",
    tags=["floor", "rug", "lounge"], tintable=["Accent"],
    anchors_bl={"center": (0, 0, T)},
)


def materials():
    return dict(
        field=D.mat("Accent", "teal", rough=0.9),
        border=D.mat("RugCream", "cream", rough=0.9),
        yellow=D.mat("RugYellow", "yellow", rough=0.9),
        coral=D.mat("RugCoral", "coral", rough=0.9),
        tassel=D.mat("Tassel", "cream", rough=0.9),
    )


def build():
    lib.begin(NAME)
    M = materials()
    D.prism("Rug", D.rrect_pts(RW, RD, 0.06, steps=4), T, M["field"], r=0.005, seg=2)
    z = T + 0.0005
    D.band("Border", D.rrect_pts(RW - 0.08, RD - 0.08, 0.04, steps=4),
           D.rrect_pts(RW - 0.2, RD - 0.2, 0.01, steps=4), M["border"], loc=(0, 0, z))
    diamond = D.rounded_pts([(0.0, -0.3), (0.24, 0.0), (0.0, 0.3), (-0.24, 0.0)], 0.03, steps=3)
    inner = D.rounded_pts([(0.0, -0.17), (0.135, 0.0), (0.0, 0.17), (-0.135, 0.0)], 0.02, steps=3)
    for k, x in enumerate((-0.58, 0.0, 0.58)):
        D.face(f"Diamond{k}", diamond, M["yellow" if k != 1 else "coral"], loc=(x, 0, z))
        D.face(f"DiamondIn{k}", inner, M["border"], loc=(x, 0, z + 0.0004))
    for k, (x, y) in enumerate(((-0.29, 0.38), (0.29, -0.38), (-0.29, -0.38), (0.29, 0.38),
                                (-0.82, 0.38), (0.82, -0.38), (-0.82, -0.38), (0.82, 0.38))):
        D.face(f"Dot{k}", D.circle_pts(0.045, 14), M["coral" if k % 2 else "yellow"],
               loc=(x, y, z))
    n = 13
    for s in (-1, 1):
        for i in range(n):
            y = (i - (n - 1) / 2) * (RD - 0.14) / (n - 1)
            x0 = s * (RW / 2 - 0.01)
            r = 0.0075  # chunky knotted tassels lying on the floor
            D.tube(f"Tassel{s}_{i}", [(x0, y, r), (x0 + s * 0.035, y, r),
                                      (x0 + s * 0.065, y + 0.004 * ((i % 3) - 1), r)],
                   r, M["tassel"], verts=6, smooth=2, caps="round")


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META)
