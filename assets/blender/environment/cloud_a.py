"""Cloud A: a long, lazy cumulus: one soft merged surface (metaballs) with a big dome in the
middle, bumps along the top, tapering to the ends, and a flat belly. About 4.7 m long,
1.8 m tall. Origin at the centre of the belly."""
import lib
from environment import _env

NAME = "cloud_a"
AO_RES = 256
AO_DISTANCE = 0.8

# (x, y, z, radius)
BALLS = [
    (0.0, 0.0, 0.55, 1.25),
    (-1.15, 0.15, 0.35, 0.95),
    (1.2, -0.1, 0.4, 1.0),
    (-0.5, -0.15, 1.15, 0.8),
    (0.6, 0.2, 1.1, 0.85),
    (-2.0, 0.0, 0.2, 0.62),
    (2.05, 0.1, 0.22, 0.66),
    (0.1, 0.55, 0.5, 0.85),
    (-0.2, -0.55, 0.45, 0.8),
    (0.05, -0.1, 1.55, 0.6),
    (-1.3, -0.15, 0.85, 0.55),
    (1.45, 0.0, 0.9, 0.55),
]


def build():
    lib.begin(NAME)
    _env.metaball_mesh("Cloud", BALLS, lib.mat("Cloud", _env.P["cloud"], rough=0.9),
                       resolution=0.11, threshold=0.75, flat=0.0)


META = dict(
    name="Cloud (long)",
    category="outdoor",
    priority="P0",
    description=("Long lazy cumulus: one soft merged surface with a flat belly, about 4.7 m long; "
                 "faintly blue white (#E6F4FC) like WL's"),
    tags=["cloud", "sky", "decor"],
    tintable=[],
    anchors={},
    notes="Origin at the centre of the flat belly. Scale freely; drift slowly.",
)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META,
                         strength=0.45, ground=None, preview_lift=0.8)
