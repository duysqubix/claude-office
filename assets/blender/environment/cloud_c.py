"""Cloud C: a small wisp of three bumps on a flat belly, one soft merged surface (metaballs).
About 2.9 m long, 1.3 m tall. Origin at the centre of the belly."""
import lib
from environment import _env

NAME = "cloud_c"
AO_RES = 256
AO_DISTANCE = 0.6

# (x, y, z, radius)
BALLS = [
    (0.0, 0.0, 0.35, 0.85),
    (-0.8, 0.06, 0.2, 0.62),
    (0.85, -0.04, 0.22, 0.66),
    (0.25, 0.08, 0.8, 0.55),
    (-0.35, -0.05, 0.65, 0.5),
]


def build():
    lib.begin(NAME)
    _env.metaball_mesh("Cloud", BALLS, lib.mat("Cloud", _env.P["cloud"], rough=0.9),
                       resolution=0.08, threshold=0.75, flat=0.0)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, strength=0.45, bake_lift=50,
                         preview_lift=0.6)
