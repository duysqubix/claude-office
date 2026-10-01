"""Stapler: a chunky red desk stapler (yes, that one). Rounded red arm over a chrome
magazine, dark base with a chrome anvil, hinge pin at the back. Long axis along X with the
stapling head at -X, so its classic profile faces the front (-Y); origin at the
desk-contact centre. cardboard_box reuses make()."""
import math

import lib
from decor import _decor as D

NAME = "stapler"
AO_RES = 256
AO_DISTANCE = 0.025
META = dict(
    name="Stapler", category="desk-item", priority="P1",
    description="Chunky red stapler with a chrome magazine and anvil",
    tags=["desk", "office", "clutter"], tintable=["Accent"],
    anchors_bl={"head": (-0.07, 0, 0.03)},
    orientation="long axis along X (three.js X), stapling head at -X",
)
HINGE = (0.064, 0, 0.03)


def materials():
    return dict(
        arm=D.mat("Accent", "red", rough=0.4),
        base=D.mat("Base", "rubber", rough=0.55),
        chrome=D.mat("Chrome", "chrome", rough=0.3, metal=0.4),
    )


# Side profiles (x, z), extruded across Y.
ARM = [(0.075, 0.03), (0.075, 0.047), (0.064, 0.0545), (0.02, 0.0552), (-0.04, 0.052),
       (-0.068, 0.047), (-0.081, 0.041), (-0.084, 0.033), (-0.079, 0.026), (-0.066, 0.0275),
       (-0.04, 0.03)]
BASE = [(0.08, 0.0), (0.08, 0.012), (-0.07, 0.012), (-0.082, 0.008), (-0.083, 0.0)]


def side(name, profile, width, material, r):
    """Prism from a side profile, centred across Y."""
    return D.prism(name, D.rounded_pts(profile, r, steps=3), width, material,
                   loc=(0, width / 2, 0), rot=D.FRONT, r=min(r, 0.006), seg=3, angle=30)


def make(M):
    """The stapler at the origin."""
    side("St_Base", BASE, 0.046, M["base"], 0.005)
    lib.rbox("St_Anvil", (0.032, 0.026, 0.002), (-0.058, 0, 0.0125), M["chrome"], r=0.0009,
             seg=1)
    lib.rbox("St_Post", (0.03, 0.038, 0.024), (0.062, 0, 0.022), M["base"], r=0.007, seg=2)
    top = D.snapshot()
    lib.rbox("St_Magazine", (0.132, 0.027, 0.011), (-0.006, 0, 0.0265), M["chrome"], r=0.003,
             seg=1)
    side("St_Arm", ARM, 0.045, M["arm"], 0.008)
    lib.cyl("St_Pin", 0.0052, 0.05, HINGE, M["chrome"], r=0.0015, seg=1, verts=14,
            rot=(math.pi / 2, 0, 0))
    D.turn(D.since(top), HINGE, (0, math.radians(-1), 0))


def build():
    lib.begin(NAME)
    make(materials())


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META)
