"""Full beard: a big soft lumberjack beard sculpted as an SDF shell hugging the jaw, from
sideburns to a rounded chin bulge, with a slim mustache on top and an oval opening round
the rig's mouth (face.mouth in rig-dimensions.json) big enough for every mouth shape to
show, from the front and from the game camera's ~40° pitch. `Hair`. Pivot at the head
centre."""
import numpy as np

from characters import _kit as kit
from characters import _monet as mo

import lib

NAME = "beard_full"
COLOR = "#5A3825"
# The opening: centred a little below the rig's mouth point so the open mouth's low edge
# (-0.128) clears, wide enough for the smile's corners. Head space, face coords.
HOLE_FY = kit.FACE["mouth"]["y"] - 0.007        # -0.10 with the current rig
HOLE_HALF_W, HOLE_HALF_H, HOLE_DEPTH = 0.085, 0.04, 0.09
META = mo.meta("Full beard", "character-face", "Big soft full beard with a mustache",
               ["facial-hair", "beard", "face"], tintable=("Hair",),
               anchors_bl={"chin": (0, -0.2, -0.24)},
               notes="Revised by Claude Rodin: the mouth opening follows the rig's mouth "
                     "point, and the mustache is lifted and slimmed so mouths read from the "
                     "game camera.")
# Mustache: a slim chevron (face x, face y, radius) rising between the eyes and sweeping
# down past the mouth corners into the beard. It sits close to the face with a thin lower
# edge so the mouth below stays in view from above, and its arms clear the eyes by 3 mm+.
STACHE = [(0.0, -0.032, 0.012), (0.028, -0.038, 0.0135), (0.05, -0.054, 0.0135),
          (0.062, -0.064, 0.013), (0.075, -0.076, 0.0125), (0.09, -0.088, 0.012),
          (0.1, -0.1, 0.011)]
STACHE_OUT = 0.002


def sdf():
    mouth = kit.face_point(0.0, HOLE_FY, 0.0)
    arms = [([tuple(kit.face_point(s * fx, fy, STACHE_OUT)) for fx, fy, _ in STACHE],
             [r for _, _, r in STACHE]) for s in (1, -1)]

    def fn(P):
        x, y, z = P[:, 0], P[:, 1], P[:, 2]
        r = np.linalg.norm(P, axis=1)
        shell = np.maximum(kit.R - 0.012 - r, r - (kit.R + 0.034))
        # Keep the jaw: below a line that rises toward the ears (sideburns), front half only.
        zcut = -0.1 + 0.09 * (x / kit.R) ** 2
        d = kit.smax(shell, z - zcut, 0.02)
        d = kit.smax(d, y - 0.02, 0.03)
        # Lumpy, chunky surface.
        d += 0.005 * np.sin(x * 70) * np.sin(z * 60)
        chin = kit.sd_ellipsoid(P, (0.0, -0.18, -0.19), (0.13, 0.09, 0.11))
        d = kit.smin(d, chin, 0.04)
        stache = kit.smin(kit.sd_lock(P, *arms[0], k=0.008), kit.sd_lock(P, *arms[1], k=0.008),
                          0.008)
        d = kit.smin(d, stache, 0.008)
        hole = kit.sd_ellipsoid(P, tuple(mouth), (HOLE_HALF_W, HOLE_DEPTH, HOLE_HALF_H))
        return kit.smax(d, -hole, 0.01)
    return fn


def build():
    lib.begin(NAME)
    hair = kit.m_hair(COLOR)
    kit.sdf_mesh("Beard", sdf(), (-0.34, -0.36, -0.36), (0.34, 0.12, 0.12), hair, voxel=0.0045,
                 trim=kit.outside_head(), target=1900, remesh="decimate")


def finalize(name):
    return mo.finalize_head(name, META, ao_distance=0.05, face=("eyes", "brows", "mouth", "cheeks"))
