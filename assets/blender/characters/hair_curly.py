"""Curly: a mop of fat round curls, clustered lumps like a toy's sculpted hair, over the
top and sides down past the ears, with a few curls tumbling onto the forehead. `Hair`.
SDF-sculpted (see _kit): a soft cap under ~70 smooth-unioned curl balls. Pivot at the head
centre."""
import numpy as np

from characters import _kit as kit

import lib

NAME = "hair_curly"
META = dict(
    name="Curly", category="character-hair", priority="P0",
    description="A mop of fat round curls, sculpted toy-style",
    tags=["hair", "curly", "volume"], tintable=["Hair"],
    anchors_bl={"headTop": (0, 0, kit.HZ + 0.075)},
)
COLOR = "#D94F30"


def edge(phi):
    a = np.abs(phi)
    front = 56.0 + 0.002 * phi ** 2
    e = front + (106.0 - front) * kit.ramp(a, 50, 78)
    return e + (114.0 - e) * kit.ramp(a, 120, 170)


def curls():
    rnd = np.random.default_rng(7)
    dirs = kit.fib_dirs(150, seed=3)
    theta = np.degrees(np.arccos(dirs[:, 2]))
    phi = np.degrees(np.arctan2(dirs[:, 0], -dirs[:, 1]))
    keep = theta < edge(phi) - 4.0
    dirs = dirs[keep]
    centres, radii = [], []
    for d in dirs:
        r = rnd.uniform(0.04, 0.054)
        centres.append(tuple(kit.head_point(d, out=0.03 + rnd.uniform(-0.006, 0.008))))
        radii.append(r)
    return centres, radii


CURLS = curls()


def sdf(P):
    S = kit
    cap = S.sd_ellipsoid(P, (0, 0.01, 0.01), (kit.HX + 0.03, kit.HY + 0.032, kit.HZ + 0.035))
    cap = S.smax(cap, S.sd_hairline(P, edge), 0.02)
    balls = S.sd_spheres(P, CURLS[0], CURLS[1], 0.012)
    return S.smin(cap, balls, 0.01)


def build():
    lib.begin(NAME)
    kit.hair_mesh("Curly", sdf, COLOR, lo=(-0.4, -0.42, -0.26), hi=(0.4, 0.42, 0.42))


def finalize(name):
    return kit.finalize(name, META, mount="head", ao_distance=0.06)
