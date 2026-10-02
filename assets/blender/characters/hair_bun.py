"""Bun: everything swept up into a big round top bun. A snug helmet with a soft rounded
hairline and shallow comb grooves rising to the bun, which sits on the back of the crown,
wound with a spiral groove, over a plump `Accent` scrunchie. `Hair` (+ `Accent` tie).
SDF-sculpted (see _kit, _lorrain). Pivot at the head centre."""
import math

import numpy as np
from mathutils import Matrix, Vector

from characters import _kit as kit
from characters import _lorrain as lo

import lib

NAME = "hair_bun"
COLOR = "#2B1B10"
UP = kit.sph_dir(24, 180)                       # the bun leans back off the crown
BUN = UP * (kit.R + 0.112)
BUN_R = (0.112, 0.112, 0.098)                   # bun ellipsoid radii, local z along UP
FRAME = kit.look(UP)
TIE = BUN - UP * 0.086
META = lo.meta(
    "Bun", "character-hair", "P1",
    "Hair swept up into a big round top bun wound with a spiral, over a coloured scrunchie",
    ["hair", "bun", "updo"], ["Hair", "Accent"],
    anchors_bl={"headTop": tuple(BUN + UP * BUN_R[2]), "bun": tuple(BUN)},
)


def edge(phi):
    a = np.abs(phi)
    front = 50.0 + 0.0024 * phi ** 2
    side = 98.0 + 6.0 * kit.ramp(a, 95, 130)
    e = front + (side - front) * kit.ramp(a, 45, 75)
    return e + (112.0 - e) * kit.ramp(a, 130, 170)


def helmet(P):
    S = kit
    d = S.sd_ellipsoid(P, (0, 0.008, 0.012), (kit.HX + 0.016, kit.HY + 0.02, kit.HZ + 0.024))
    return S.smax(d, S.sd_hairline(P, edge), 0.02)


def spiral(turns=2.4, samples=60):
    """A groove winding from the bun's base up to its top, just above its surface."""
    F = Matrix(FRAME.tolist())
    pts = []
    for i in range(samples):
        t = i / (samples - 1)
        lat = -0.55 + 1.4 * t                    # from below the equator up past the top
        lat = min(lat, 0.97)
        a = 2 * math.pi * turns * t
        ring = math.sqrt(max(1 - lat * lat, 0.0))
        local = Vector((BUN_R[0] * ring * math.cos(a), BUN_R[1] * ring * math.sin(a),
                        BUN_R[2] * lat))
        pts.append(tuple(BUN + F @ (local * (1 + 0.025))))
    return pts


SPIRAL = spiral()


def bun(P):
    d = kit.sd_ellipsoid(P, tuple(BUN), BUN_R, FRAME)
    return kit.smax(d, -kit.sd_groove(P, SPIRAL, 0.0062, 0.0062), 0.005)


def hair(P):
    # The bun rides on a short neck of gathered hair, where the scrunchie sits.
    neck = kit.sd_round_cone(P, tuple(UP * (kit.R + 0.01)), tuple(TIE), 0.075, 0.06)
    return kit.smin(kit.smin(helmet(P), neck, 0.03), bun(P), 0.02)


# Comb lines rising from the hairline toward the bun, fading out before either end.
GROOVES = ([[(20, 180 - ph * 0.2), (24, ph * 0.5), (45, ph)] for ph in (-46, -22, 0, 22, 46)] +
           [[(40, s * 150), (70, s * 118), (88, s * 86)] for s in (1, -1)] +
           [[(50, 180 + s * 8), (100, 180 + s * 34)] for s in (1, -1)])


def build():
    lib.begin(NAME)
    fn = lo.soft_carve(hair, GROOVES)
    kit.hair_mesh("Bun", fn, COLOR, lo=(-0.36, -0.38, -0.26), hi=(0.36, 0.4, 0.5), target=1650)
    kit.sdf_mesh("Tie", lambda P: lo.sd_scrunchie(P, TIE, UP, major=0.068, minor=0.024),
                 TIE - Vector((0.1, 0.1, 0.1)), TIE + Vector((0.1, 0.1, 0.1)), kit.m_accent(),
                 voxel=0.002, target=170, remesh="decimate")


def finalize(name):
    return kit.finalize(name, META, mount="head", ao_distance=0.08)
