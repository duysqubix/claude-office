"""Full beard: a big soft lumberjack beard sculpted as an SDF shell hugging the jaw, from
sideburns to a rounded chin bulge, with a mustache on top and the mouth left open so the
smile shows. `Hair`. Pivot at the head centre."""
import numpy as np

from characters import _kit as kit
from characters import _monet as mo

import lib

NAME = "beard_full"
COLOR = "#5A3825"
MOUTH_FY = -0.074
META = mo.meta("Full beard", "character-face", "Big soft full beard with a mustache",
               ["facial-hair", "beard", "face"], tintable=("Hair",),
               anchors_bl={"chin": (0, -0.2, -0.24)})


def sdf():
    mouth = kit.face_point(0.0, MOUTH_FY, 0.0)
    stache = [(tuple(kit.face_point(s * fx, fy, 0.012)), r) for s in (1, -1)
              for fx, fy, r in ((0.02, -0.05, 0.026), (0.055, -0.056, 0.024), (0.08, -0.05, 0.02))]

    def fn(P):
        x, y, z = P[:, 0], P[:, 1], P[:, 2]
        r = np.linalg.norm(P, axis=1)
        shell = np.maximum(kit.R - 0.012 - r, r - (kit.R + 0.034))
        # Keep the jaw: below a line that rises toward the ears (sideburns), front half only.
        zcut = -0.05 + 0.07 * (x / kit.R) ** 2
        d = kit.smax(shell, z - zcut, 0.02)
        d = kit.smax(d, y - 0.02, 0.03)
        # Lumpy, chunky surface.
        d += 0.005 * np.sin(x * 70) * np.sin(z * 60)
        chin = kit.sd_ellipsoid(P, (0.0, -0.18, -0.19), (0.13, 0.09, 0.11))
        d = kit.smin(d, chin, 0.04)
        d = kit.smin(d, kit.sd_spheres(P, [c for c, _ in stache], [r for _, r in stache], 0.015),
                     0.01)
        hole = kit.sd_ellipsoid(P, tuple(mouth), (0.05, 0.09, 0.024))
        return kit.smax(d, -hole, 0.01)
    return fn


def build():
    lib.begin(NAME)
    hair = kit.m_hair(COLOR)
    kit.sdf_mesh("Beard", sdf(), (-0.34, -0.36, -0.36), (0.34, 0.12, 0.12), hair, voxel=0.0045,
                 trim=kit.outside_head(), target=1900, remesh="decimate")


def finalize(name):
    return mo.finalize_head(name, META, ao_distance=0.05, face=("eyes", "brows", "mouth", "cheeks"))
