"""Award plaque: "EMPLOYEE OF THE MONTH". A chunky wooden shield with a gold star, raised gold
lettering, gold screws, and a cream `Label` nameplate (planar 0..1 UVs, no AO) where the
game paints this month's winner. 0.3 × 0.38 m; wall item: origin at the back centre, face
looks -Y."""
import math

from mathutils import Vector

import lib
from decor import _decor as D

NAME = "award_plaque"
AO_RES = 256
AO_DISTANCE = 0.03
PW, PH, PT = 0.3, 0.38, 0.026
LABEL_W, LABEL_H = 0.21, 0.07
LABEL_Z = -0.045
META = dict(
    name="Award plaque", category="decor", priority="P1",
    description="Employee of the Month shield plaque; the game paints the winner on its Label",
    tags=["wall", "award", "label"], tintable=["Label"],
    anchors_bl={"label": (0, -PT - 0.012, LABEL_Z)}, mount="wall: origin is the back centre",
    label=dict(width=LABEL_W, height=LABEL_H, canvas=[256, 85], sides=1),
)


def shield():
    hw, top = PW / 2, PH / 2
    pts = [(-hw, top), (-hw, -0.02)]
    for k in range(1, 8):  # sides curving in to a soft point at the bottom
        t = k / 8
        pts.append((-hw * (1 - t) ** 1.25, -0.02 - (top - 0.02 + 0.0) * math.sin(t * math.pi / 2)))
    pts.append((0.0, -top))
    pts += [(-x, z) for x, z in reversed(pts[1:-1])]
    pts.append((hw, top))
    return D.rounded_pts(D._dedupe(pts), 0.03, steps=3)


def materials():
    return dict(
        wood=D.mat("Wood", "woodDark", rough=0.55),
        gold=D.mat("Gold", "gold", rough=0.3, metal=0.4),
        cream=D.mat("Plate", "paper2", rough=0.6),
        label=D.label_mat("Label"),
    )


def build():
    lib.begin(NAME)
    M = materials()
    D.prism("Shield", shield(), PT, M["wood"], loc=(0, 0, 0), rot=D.FRONT, r=0.006, seg=1)
    f = -PT
    D.prism("Star", D.rounded_pts(D.star_pts(5, 0.042, 0.019), 0.004, steps=2), 0.01, M["gold"],
            loc=(0, f, 0.115), rot=D.FRONT, r=0.003, seg=1)
    D.text("Txt_Employee", "EMPLOYEE", 0.03, M["gold"], loc=(0, f, 0.055), depth=0.004, res=1)
    D.text("Txt_Month", "OF THE MONTH", 0.019, M["gold"], loc=(0, f - 0.0004, 0.026), depth=0,
           res=1)
    D.prism("Plate", D.rrect_pts(LABEL_W + 0.02, LABEL_H + 0.02, 0.012), 0.006, M["gold"],
            loc=(0, f, LABEL_Z), rot=D.FRONT, r=0.002, seg=1)
    D.face("Label", D.rrect_pts(LABEL_W, LABEL_H, 0.006, steps=2), M["label"],
           loc=(0, f - 0.0065, LABEL_Z), rot=D.FRONT)
    for s in (-1, 1):
        lib.sphere(f"Screw{s}", 0.008, (s * 0.115, f, 0.155), M["gold"], u=10, v=5,
                   scale=(1, 0.5, 1))


def sample_name():
    ink = D.mat("_PreviewInk", "ink", rough=0.6)
    D.text("_Preview_Name", "Claudette", 0.036, ink, loc=(0, -PT - 0.0075, LABEL_Z), depth=0,
           res=3)


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META, planar=("Label",), wall=True,
                      preview=sample_name)
