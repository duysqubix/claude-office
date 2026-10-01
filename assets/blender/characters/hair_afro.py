"""Afro: a big round puffy cloud of hair, lumpy with fat curl clusters, framing the face
from the forehead down to the jaw. `Hair`. SDF-sculpted (see _kit): a big soft ball
crusted with smooth-unioned lumps, cut open around the face along a hairline. Pivot at the
head centre."""
import numpy as np

from characters import _kit as kit

import lib

NAME = "hair_afro"
CENTRE = (0.0, 0.07, 0.09)
RADII = (0.37, 0.35, 0.33)
META = dict(
    name="Afro", category="character-hair", priority="P0",
    description="Big round puffy afro, lumpy with curl clusters",
    tags=["hair", "afro", "volume"], tintable=["Hair"],
    anchors_bl={"headTop": (0, 0, CENTRE[2] + RADII[2] + 0.02)},
)
COLOR = "#5A3825"


def edge(phi):
    a = np.abs(phi)
    front = 58.0 + 0.0025 * phi ** 2
    e = front + (112.0 - front) * kit.ramp(a, 48, 80)
    return e + (122.0 - e) * kit.ramp(a, 120, 170)


def lumps():
    rnd = np.random.default_rng(11)
    dirs = kit.fib_dirs(56, seed=5)
    c = np.array(CENTRE)
    r = np.array(RADII)
    centres = [tuple(c + d * r * rnd.uniform(0.8, 0.86)) for d in dirs]
    radii = [rnd.uniform(0.095, 0.118) for _ in dirs]
    return centres, radii


LUMPS = lumps()


def sdf(P):
    S = kit
    ball = S.sd_ellipsoid(P, CENTRE, [x - 0.03 for x in RADII])
    ball = S.smin(ball, S.sd_spheres(P, LUMPS[0], LUMPS[1], 0.02), 0.03)
    # Fill under the jaw-line sides so the cloud sits on the head.
    ball = S.smin(ball, S.sd_ellipsoid(P, (0, 0.02, -0.06), (0.3, 0.28, 0.16)), 0.06)
    return S.smax(ball, S.sd_hairline(P, edge, r_ref=0.33), 0.03)


def build():
    lib.begin(NAME)
    kit.hair_mesh("Afro", sdf, COLOR, lo=(-0.48, -0.46, -0.28), hi=(0.48, 0.5, 0.56),
                  voxel=0.004)


def finalize(name):
    return kit.finalize(name, META, mount="head", ao_distance=0.1)
