"""Mustache: a curly handlebar mustache sculpted as a soft SDF: a plump stroke each side,
meeting in a little dip under the nose, sweeping out and down past the mouth corners and
curling up at the tips beside the eyes. It lies close to the face with a thin lower edge,
clear of the rig's mouth (face.mouth in rig-dimensions.json), so every mouth shape reads
from the front and from the game camera up to 40° above. `Hair`. Sits on the face above
the mouth; pivot at the head centre."""
from mathutils import Vector

from characters import _kit as kit
from characters import _monet as mo

import lib

NAME = "mustache"
COLOR = "#5A3825"
# One side's stroke, middle to tip: (face x, face y, visible half-height, how far it stands
# proud of the face). Each point is a sphere sunk into the face, so the stroke is a low
# rounded pad: seen from 40° above it hides only ~3 mm of face below its lower edge, and over
# the mouth (|x| < 0.045) that edge stays above the smile's corners (face y -0.076). Outside
# the mouth the arms dip under the eyes (2 mm+ clear) and curl up past their outer edges.
STROKE = [(0.0, -0.045, 0.017, 0.009), (0.022, -0.044, 0.023, 0.0105),
          (0.042, -0.051, 0.018, 0.0095), (0.06, -0.064, 0.012, 0.008),
          (0.08, -0.073, 0.0105, 0.007), (0.098, -0.075, 0.009, 0.0065),
          (0.114, -0.068, 0.0078, 0.006), (0.124, -0.056, 0.0066, 0.0055),
          (0.129, -0.044, 0.0055, 0.005), (0.128, -0.033, 0.0045, 0.0045)]
FY = -0.05
META = mo.meta("Mustache", "character-face", "Chunky curly handlebar mustache",
               ["facial-hair", "mustache", "face"], tintable=("Hair",),
               anchors_bl={"center": tuple(kit.face_point(0, FY, 0.01))},
               notes="Revised by Claude Rodin: lifted, slimmed and laid closer to the face so "
                     "every mouth reads from the game camera, from the front up to 40° above.")


def sdf():
    # Smooth the stroke (all four numbers) so the chain of round cones has no lumps.
    pts = kit.catmull([Vector(p) for p in STROKE], samples=36)
    sides = []
    for s in (1, -1):
        centres, radii = [], []
        for fx, fy, h, proud in pts:
            r = (h * h + proud * proud) / (2 * proud)     # sphere through the cap's rim
            centres.append(tuple(kit.face_point(s * fx, fy, proud - r)))
            radii.append(r)
        sides.append((centres, radii))

    def fn(P):
        return kit.smin(kit.sd_lock(P, *sides[0], k=0.002), kit.sd_lock(P, *sides[1], k=0.002),
                        0.004)
    return fn


def build():
    lib.begin(NAME)
    hair = kit.m_hair(COLOR)
    kit.sdf_mesh("Mustache", sdf(), (-0.17, -0.35, -0.13), (0.17, -0.17, 0.06), hair,
                 voxel=0.0025, trim=kit.outside_head(), target=900, remesh="decimate")


def finalize(name):
    return mo.finalize_head(name, META, ao_distance=0.04,
                            face=("eyes", "brows", "cheeks"))
