"""Bob: a chunky rounded helmet to the jaw with the ends tucked under, a side-swept fringe
of four fat rounded tips, and clean carved grooves running up from the notches between
them, toy-hair style. `Hair`. SDF-sculpted (see _kit): a soft helmet cut along a hairline
curve, trimmed where it is buried in the head. Pivot at the head centre."""
import numpy as np

from characters import _kit as kit

import lib

NAME = "hair_bob"
META = dict(
    name="Bob", category="character-hair", priority="P0",
    description="Chunky jaw-length bob with a scalloped side-swept fringe",
    tags=["hair", "bob"], tintable=["Hair"],
    anchors_bl={"headTop": (0, 0, kit.HZ + 0.036)},
)
COLOR = "#A0522D"
TIPS = [-46, -17, 12, 40]          # fringe tips (phi, degrees)
NOTCHES = [-31, -2.5, 26]


def edge(phi):
    """Hairline: theta (deg from the crown) where the hair ends, around the head."""
    a = np.abs(phi)
    fringe = 60.0 - 0.045 * phi + 0.0026 * phi ** 2 + kit.bumps(phi, TIPS, 8.0, 5.5)
    jaw = 123.0 - 5.0 * kit.ramp(a, 120, 180)
    return fringe + (jaw - fringe) * kit.ramp(a, 56, 80)


def base(P):
    S = kit
    d = S.sd_ellipsoid(P, (0, 0.01, 0.012), (kit.HX + 0.03, kit.HY + 0.034, kit.HZ + 0.036))
    for s in (1, -1):
        d = S.smin(d, S.sd_ellipsoid(P, (s * 0.13, 0.035, -0.07), (0.175, 0.2, 0.13)), 0.06)
    d = S.smin(d, S.sd_ellipsoid(P, (0, 0.11, -0.06), (0.215, 0.18, 0.14)), 0.06)
    return S.smax(d, S.sd_hairline(P, edge), 0.022)


GROOVES = ([[(24, n * 0.4), (44, n * 0.75), (float(edge(np.array([n]))[0]) - 3, n)]
            for n in NOTCHES] +
           [[(40, ph), (80, ph), (118, ph)] for ph in (96, 138, 180, 222, 264)])
_paths = None


def sdf(P):
    global _paths
    if _paths is None:
        _paths = [kit.groove_path(base, g, samples=12, sink=-0.001, extend=0.03)
                  for g in GROOVES]
    d = base(P)
    for pts in _paths:
        d = kit.smax(d, -kit.sd_groove(P, pts, 0.002, 0.0085), 0.005)
    return d


def build():
    lib.begin(NAME)
    kit.sdf_mesh("Bob", sdf, (-0.34, -0.36, -0.24), (0.34, 0.34, 0.35), kit.m_hair(COLOR),
                 voxel=0.0035, trim=kit.outside_head(), target=1950, remesh="decimate")


def finalize(name):
    return kit.finalize(name, META, mount="head", ao_distance=0.08)
