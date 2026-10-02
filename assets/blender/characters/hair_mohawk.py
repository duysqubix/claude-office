"""Mohawk: a bold crest on an otherwise bald head. Seven fat fin spikes swept back from the
forehead over the crown to the nape, tallest in the middle, melted into a narrow strip of
hair. The fins are flattened side to side so the crest reads from the front and in
profile. `Hair`. SDF-sculpted (see _kit). Pivot at the head centre."""
import numpy as np

from characters import _kit as kit
from characters import _lorrain as lo

import lib

NAME = "hair_mohawk"
COLOR = "#FF8FB1"
FLAT = 1.7          # fins are this many times thinner across (x) than front to back
SWEEP = 30.0        # degrees the fins lean back from the scalp normal


def mid(s, r):
    """Point on the head's midline: s degrees from the crown, negative toward the face."""
    return kit.sph(abs(s), 0.0 if s < 0 else 180.0, r)


def fin(s, length):
    n = mid(s, 1.0).normalized()
    back = (mid(s + 1, 1.0) - mid(s - 1, 1.0)).normalized()
    a = np.radians(SWEEP)
    d = (n * np.cos(a) + back * np.sin(a)).normalized()
    base = mid(s, kit.R - 0.01)
    return base, base + d * (length + 0.03)


STRIP = [tuple(mid(s, kit.R + 0.004)) for s in range(-44, 126, 6)]
FINS = [fin(s, l) for s, l in ((-32, 0.1), (-9, 0.135), (15, 0.162), (39, 0.165),
                               (63, 0.148), (87, 0.122), (109, 0.092))]
TOP = max((tip for _, tip in FINS), key=lambda v: v.z)
META = lo.meta(
    "Mohawk", "character-hair", "P1",
    "A bold crest of fat swept-back fin spikes on a bald head",
    ["hair", "mohawk", "punk", "spiky"], ["Hair"],
    anchors_bl={"headTop": tuple(TOP)},
)


def crest(P):
    Q = np.array(P, dtype=np.float32, copy=True)
    Q[:, 0] *= FLAT
    d = kit.sd_lock(Q, STRIP, [0.03] * len(STRIP), k=0.01)
    for base, tip in FINS:
        lo_b = np.minimum(np.array(base), np.array(tip)) - 0.07
        hi_b = np.maximum(np.array(base), np.array(tip)) + 0.07
        lo_b[0], hi_b[0] = -0.12 * FLAT, 0.12 * FLAT
        f = kit.bounded(Q, lo_b, hi_b,
                        lambda X, a=tuple(base), b=tuple(tip): kit.sd_round_cone(X, a, b, 0.058,
                                                                                0.015))
        d = kit.smin(d, f, 0.035)
    return d / FLAT


def build():
    lib.begin(NAME)
    kit.hair_mesh("Mohawk", crest, COLOR, lo=(-0.1, -0.36, -0.2), hi=(0.1, 0.44, 0.5),
                  voxel=0.003, target=1500)


def finalize(name):
    return kit.finalize(name, META, mount="head", ao_distance=0.07)
