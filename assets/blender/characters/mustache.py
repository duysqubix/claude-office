"""Mustache: a chunky handlebar mustache sculpted as a soft SDF: two plump lobes meeting under
the eyes, sweeping out and curling up at the tips. `Hair`. Sits on the face above the mouth;
pivot at the head centre."""
import numpy as np

from characters import _kit as kit
from characters import _monet as mo

import lib

NAME = "mustache"
COLOR = "#5A3825"
FY = -0.048
META = mo.meta("Mustache", "character-face", "Chunky curly handlebar mustache",
               ["facial-hair", "mustache", "face"], tintable=("Hair",),
               anchors_bl={"center": tuple(kit.face_point(0, FY, 0.02))})


def sdf():
    lobes = []
    for s in (1, -1):
        for fx, fy, r in ((0.022, FY, 0.026), (0.055, FY - 0.006, 0.024), (0.085, FY + 0.004, 0.018),
                          (0.1, FY + 0.024, 0.014)):
            c = kit.face_point(s * fx, fy, 0.004)
            lobes.append((tuple(c), r))
    cs = [c for c, _ in lobes]
    rs = [r for _, r in lobes]

    def fn(P):
        d = kit.sd_spheres(P, cs, rs, 0.018)
        # Flatten against the face a little (thinner front-to-back than tall).
        return d + 0.004 * np.clip(-P[:, 1] - kit.R, 0, None) * 10
    return fn


def build():
    lib.begin(NAME)
    hair = kit.m_hair(COLOR)
    kit.sdf_mesh("Mustache", sdf(), (-0.15, -0.34, -0.12), (0.15, -0.18, 0.04), hair,
                 voxel=0.0025, trim=kit.outside_head(), target=900, remesh="decimate")


def finalize(name):
    return mo.finalize_head(name, META, ao_distance=0.04,
                            face=("eyes", "brows", "cheeks"))
