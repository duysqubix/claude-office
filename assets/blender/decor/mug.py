"""Mug: chunky two-tone desk mug. Tintable `Accent` glaze outside, cream glaze inside, a fat
D handle on +X, coffee with a little latte-art heart. 0.1 m tall; origin at the
desk-contact centre. mug_manager reuses make()."""
import math

import lib
from decor import _decor as D

NAME = "mug"
AO_RES = 256
AO_DISTANCE = 0.035
META = dict(
    name="Mug", category="desk-item", priority="P0",
    description="Chunky two-tone desk mug with coffee and a latte-art heart",
    tags=["desk", "coffee", "clutter"], tintable=["Accent"],
    anchors_bl={"coffee": (0, 0, 0.087), "handle": (0.075, 0, 0.056)},
)

# (radius, z): outside wall up to the rim crest, then down the inside to the coffee surface.
OUTER = [(0.0, 0.0), (0.03, 0.0), (0.037, 0.0015), (0.042, 0.006), (0.0449, 0.016),
         (0.0458, 0.034), (0.0458, 0.07), (0.0452, 0.088), (0.0443, 0.096), (0.0428, 0.1),
         (0.041, 0.1012)]
INNER = [(0.0393, 0.1003), (0.0383, 0.097), (0.0379, 0.092), (0.0378, 0.087)]
COFFEE_Z = 0.087
INNER_R = 0.0412  # faces closer to the axis than this (up top) are the inside glaze
HANDLE = [(0.041, 0, 0.083), (0.058, 0, 0.087), (0.0745, 0, 0.073), (0.076, 0, 0.049),
          (0.063, 0, 0.031), (0.034, 0, 0.026)]


def outer_r(z):
    """Radius of the outside wall at height z (unscaled)."""
    for (r0, z0), (r1, z1) in zip(OUTER[3:], OUTER[4:]):
        if z0 <= z <= z1:
            return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
    return OUTER[5][0]


def materials():
    return dict(
        glaze=D.mat("Accent", "coral", rough=0.4),
        inside=D.mat("Glaze", "#FFF7EC", rough=0.4),
        coffee=D.mat("Coffee", "#7A4A2E", rough=0.45),
        foam=D.mat("Foam", "foam", rough=0.6),
    )


def make(M, s=1.0, heart=True):
    """Build the mug scaled by s (shared with mug_manager)."""
    prof = [(r * s, z * s) for r, z in OUTER + INNER + [(0.0, COFFEE_Z)]]
    body = D.lathe("Mug_Body", prof, M["glaze"], verts=32, sharp=50)
    D.paint(body, M["inside"], lambda c, n: c.z > 0.05 * s and math.hypot(c.x, c.y) < INNER_R * s)
    D.paint(body, M["coffee"], lambda c, n: abs(c.z - COFFEE_Z * s) < 0.0004 * s and n.z > 0.9)
    D.tube("Mug_Handle", [tuple(v * s for v in p) for p in HANDLE], 0.0088 * s, M["glaze"],
           verts=12, smooth=5, caps=None)
    if heart:
        D.prism("Mug_Heart", D.heart_pts(0.028 * s, 32), 0.001 * s, M["foam"],
                loc=(0, -0.002 * s, (COFFEE_Z - 0.0003) * s), back=False)


def build():
    lib.begin(NAME)
    make(materials())


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META)
