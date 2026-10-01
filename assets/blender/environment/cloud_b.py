"""Cloud B: a tall, round cumulus: a big bumpy dome on a flat belly, one soft merged surface
(metaballs). About 3.8 m wide, 2.8 m tall. Origin at the centre of the belly."""
import lib
from environment import _env

NAME = "cloud_b"
AO_RES = 256
AO_DISTANCE = 0.8

# (x, y, z, radius)
BALLS = [
    (0.0, 0.0, 0.8, 1.3),
    (-1.05, 0.1, 0.4, 0.9),
    (1.1, -0.05, 0.42, 0.92),
    (-0.15, 0.1, 1.75, 0.9),
    (0.7, -0.1, 1.45, 0.78),
    (-0.8, -0.1, 1.3, 0.72),
    (0.25, 0.0, 2.25, 0.55),
    (0.0, 0.7, 0.6, 0.85),
    (0.1, -0.65, 0.55, 0.85),
]


def build():
    lib.begin(NAME)
    _env.metaball_mesh("Cloud", BALLS, lib.mat("Cloud", _env.P["cloud"], rough=0.9),
                       resolution=0.11, threshold=0.75, flat=0.0)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, strength=0.45, bake_lift=50,
                         preview_lift=0.8)
