"""Spiky: gravity-defying anime hair. A snug helmet sprouting eighteen fat, soft-tipped
cone spikes: a crown fan sweeping up and back, a ring flaring up and back around the head,
a layer of lower spikes flicking back over the nape, and bangs flicking down over the
forehead. `Hair`.
SDF-sculpted (see _kit). Pivot at the head centre."""
import numpy as np
from mathutils import Vector

from characters import _kit as kit
from characters import _lorrain as lo

import lib

NAME = "hair_spiky"
COLOR = "#4D96FF"
UPBACK = Vector((0.0, 0.75, 0.55))
DOWNBACK = Vector((0.0, 0.6, -0.35))
DOWNFRONT = Vector((0.0, -0.2, -0.75))
# (theta, phi, length, base radius, lean): lean bends the spike off the scalp normal.
SPIKE_SPECS = (
    [(14, 180, 0.15, 0.072, UPBACK), (24, 140, 0.14, 0.07, UPBACK),
     (24, 220, 0.14, 0.07, UPBACK), (16, 0, 0.12, 0.068, UPBACK * 0.5)] +
    [(46, ph, 0.13, 0.066, UPBACK * 0.7) for ph in (60, 112, 158, 202, 248, 300)] +
    [(78, ph, 0.1, 0.06, DOWNBACK) for ph in (100, 145, 180, 215, 260)] +
    [(54, ph, 0.08, 0.056, DOWNFRONT) for ph in (-30, -6, 18)])


def spike(theta, phi, length, r, lean):
    n = kit.sph_dir(theta, phi)
    d = (n + lean).normalized()
    base = n * (kit.R + 0.004)
    return base, base + d * (length + 0.028), r


SPIKES = [spike(*s) for s in SPIKE_SPECS]
TOP = max((tip for _, tip, _ in SPIKES), key=lambda v: v.z)
META = lo.meta(
    "Spiky", "character-hair", "P1",
    "Gravity-defying anime spikes with flicked bangs",
    ["hair", "spiky", "anime", "volume"], ["Hair"],
    anchors_bl={"headTop": tuple(TOP)},
)


def edge(phi):
    a = np.abs(phi)
    front = 56.0 + 0.0022 * phi ** 2
    side = 98.0 + 6.0 * kit.ramp(a, 95, 130)
    e = front + (side - front) * kit.ramp(a, 48, 76)
    return e + (112.0 - e) * kit.ramp(a, 130, 170)


def hair(P):
    S = kit
    d = S.sd_ellipsoid(P, (0, 0.01, 0.012), (kit.HX + 0.024, kit.HY + 0.027, kit.HZ + 0.03))
    d = S.smax(d, S.sd_hairline(P, edge), 0.02)
    for base, tip, r in SPIKES:
        lo_b = np.minimum(np.array(base), np.array(tip)) - (r + 0.04)
        hi_b = np.maximum(np.array(base), np.array(tip)) + (r + 0.04)
        f = kit.bounded(P, lo_b, hi_b,
                        lambda X, a=tuple(base), b=tuple(tip), r=r:
                        kit.sd_round_cone(X, a, b, r, 0.016))
        d = S.smin(d, f, 0.028)
    return d


def build():
    lib.begin(NAME)
    kit.hair_mesh("Spiky", hair, COLOR, lo=(-0.46, -0.44, -0.26), hi=(0.46, 0.52, 0.52),
                  voxel=0.0038, target=1950)


def finalize(name):
    return kit.finalize(name, META, mount="head", ao_distance=0.08)
