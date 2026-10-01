"""Slick: the manager's slicked-back hair. A tight glossy helmet combed straight back, a
soft pompadour wave rising off the forehead, a small widow's peak, neat sides and nape,
and long comb grooves running front to back. `Hair` (glossier than the rest).
SDF-sculpted (see _kit). Pivot at the head centre."""
import numpy as np

from characters import _kit as kit

import lib

NAME = "hair_slick"
META = dict(
    name="Slicked back", category="character-hair", priority="P0",
    description="The manager's glossy slicked-back hair with a pompadour wave",
    tags=["hair", "short", "slick", "manager"], tintable=["Hair"],
    anchors_bl={"headTop": (0, 0, kit.HZ + 0.06)},
)
COLOR = "#3B2A20"


def edge(phi):
    a = np.abs(phi)
    front = 47.0 + 0.0024 * phi ** 2 + kit.bumps(phi, [0], 9.0, 5.0)  # widow's peak
    side = 100.0 + 5.0 * kit.ramp(a, 95, 130)
    e = front + (side - front) * kit.ramp(a, 46, 72)
    return e + (112.0 - e) * kit.ramp(a, 130, 170)


def base(P):
    S = kit
    d = S.sd_ellipsoid(P, (0, 0.016, 0.012), (kit.HX + 0.014, kit.HY + 0.022, kit.HZ + 0.03))
    # Pompadour: a rolled wave off the forehead, swept back into the helmet.
    d = S.smin(d, S.sd_ellipsoid(P, (0.0, -0.13, 0.205), (0.15, 0.1, 0.075),
                                 S.rot3(0.75, 0.0, 0.0)), 0.06)
    d = S.smin(d, S.sd_ellipsoid(P, (0.0, 0.08, 0.17), (0.2, 0.17, 0.12)), 0.06)
    return S.smax(d, S.sd_hairline(P, edge), 0.018)


GROOVES = [[(52, ph), (18, ph * 0.9), (24, 180 - ph * 1.1), (70, 180 - ph * 0.7)]
           for ph in (-40, -20, 0, 20, 40)]


def build():
    lib.begin(NAME)
    fn = kit.carved(base, GROOVES, r0=0.003, r1=0.006, extend=0.0)
    kit.hair_mesh("Slick", fn, COLOR, rough=0.38)


def finalize(name):
    return kit.finalize(name, META, mount="head", ao_distance=0.08)
