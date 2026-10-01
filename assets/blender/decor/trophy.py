"""Trophy: a chunky shiny gold cup with fat loop handles and a cream star, on a stem and a
two-tier wooden base with a gold "#1" plaque. 0.19 m tall; origin at the desk-contact
centre; the star and plaque face -Y."""
import math

import lib
from decor import _decor as D

NAME = "trophy"
AO_RES = 256
AO_DISTANCE = 0.035
META = dict(
    name="Trophy", category="desk-item", priority="P1",
    description="Chunky gold trophy cup with a star, on a wooden base with a #1 plaque",
    tags=["desk", "award", "manager"], tintable=[],
    anchors_bl={"top": (0, 0, 0.187)},
)
# Outside of the bowl (radius, z), then down the inside.
BOWL = [(0.0, 0.103), (0.014, 0.104), (0.03, 0.11), (0.044, 0.122), (0.053, 0.14),
        (0.057, 0.16), (0.058, 0.176), (0.0602, 0.1803), (0.0597, 0.1852), (0.0562, 0.1868),
        (0.0532, 0.1832), (0.0515, 0.175), (0.046, 0.16), (0.0, 0.15)]


def bowl_r(z):
    for (r0, z0), (r1, z1) in zip(BOWL, BOWL[1:8]):
        if z0 <= z <= z1:
            return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
    return BOWL[6][0]


def materials():
    return dict(
        gold=D.mat("Gold", "gold", rough=0.28, metal=0.35),
        wood=D.mat("Wood", "#8A5A36", rough=0.6),
        star=D.mat("Star", "cream", rough=0.45),
        ink=D.mat("Ink", "ink", rough=0.6),
    )


def base(M):
    lib.rbox("Base_Low", (0.112, 0.112, 0.034), (0, 0, 0.017), M["wood"], r=0.008, seg=2)
    lib.rbox("Base_High", (0.084, 0.084, 0.022), (0, 0, 0.045), M["wood"], r=0.006, seg=2)
    y = -0.056 - 0.0004
    D.prism("Plaque", D.rrect_pts(0.07, 0.022, 0.004, steps=2), 0.0015, M["gold"],
            loc=(0, y + 0.0011, 0.0175), rot=D.FRONT, r=0.0006, seg=1)
    D.text("Plaque_Text", "#1", 0.016, M["ink"], loc=(0, y - 0.0007, 0.0175), depth=0, res=3)


def cup(M):
    D.lathe("Stem", [(0.0, 0.0558), (0.031, 0.0558), (0.0325, 0.0588), (0.026, 0.064),
                     (0.012, 0.072), (0.0092, 0.08), (0.0092, 0.091), (0.0142, 0.0965),
                     (0.0162, 0.1005), (0.0125, 0.1045), (0.0, 0.106)], M["gold"], verts=28)
    D.lathe("Bowl", BOWL, M["gold"], verts=36, sharp=60)
    for s in (-1, 1):
        # Upper end buried in the bowl wall (inner r ≈ 0.049, outer ≈ 0.0575 there).
        D.tube(f"Handle{s}", [(s * 0.0535, 0, 0.169), (s * 0.072, 0, 0.1735), (s * 0.087, 0, 0.16),
                              (s * 0.083, 0, 0.139), (s * 0.066, 0, 0.127), (s * 0.044, 0, 0.124)],
               0.0068, M["gold"], verts=10, smooth=4, caps=None)
    z = 0.148
    r = bowl_r(z) + 0.0002
    st = D.prism("Star", D.star_pts(5, 0.0175, 0.0078), 0.0016, M["star"], loc=(0, -r, z),
                 rot=D.FRONT, back=False)
    D.bake_xform(st)
    D.wrap_cylinder(st, lambda zz: bowl_r(zz) + 0.0002, base=r)


def build():
    lib.begin(NAME)
    M = materials()
    base(M)
    cup(M)


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META)
