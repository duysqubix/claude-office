"""Buzz: a short buzz cut. A thin, even cap hugging the scalp, a touch fuller on top, with a
natural hairline: slightly receding temples, little sideburns, a curve up around the ears
and a neat nape. `Hair`. SDF-sculpted (see _kit). Pivot at the head centre."""
import numpy as np

from characters import _kit as kit
from characters import _lorrain as lo

import lib

NAME = "hair_buzz"
COLOR = "#5A3825"
META = lo.meta(
    "Buzz cut", "character-hair", "P1",
    "Short buzz cut hugging the scalp, with neat temples, sideburns and nape",
    ["hair", "short", "buzz"], ["Hair"],
    anchors_bl={"headTop": (0, 0, kit.HZ + 0.02)},
)


def edge(phi):
    a = np.abs(phi)
    front = 52.0 + 0.0026 * phi ** 2 - kit.bumps(phi, [-40, 40], 9.0, 6.0)   # temples
    side = 96.0 + kit.bumps(phi, [-73, 73], 5.0, 9.0)                          # sideburns
    side -= kit.bumps(phi, [-100, 100], 10.0, 9.0)                             # around ears
    e = front + (side - front) * kit.ramp(a, 50, 70)
    return e + (115.0 - e) * kit.ramp(a, 118, 165)


def buzz(P):
    # A cap that thins from 1.8 cm on top to 7 mm at the hairline, so the edge reads as
    # short clipped hair, not a helmet rim.
    theta, _, r = kit.sph_angles(P)
    thick = 0.007 + 0.011 * (1 - kit.ramp(theta, 25, 95))
    d = r - (kit.R + thick)
    return kit.smax(d, kit.sd_hairline(P, edge), 0.008)


def build():
    lib.begin(NAME)
    kit.hair_mesh("Buzz", buzz, COLOR, voxel=0.003, target=1100)


def finalize(name):
    return kit.finalize(name, META, mount="head", ao_distance=0.06)
