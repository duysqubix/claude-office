"""Beanie: an oversized knit beanie with vertical ribbing, a fat folded cuff (finer ribs),
a little leather label, and a fluffy pom-pom that is its own node `Pom` (pivot at its base)
so the game can make it bounce. `Accent` knit, cream pom. Pivot at the head centre."""
import math

import numpy as np
from mathutils import Vector

from characters import _kit as kit

import lib

NAME = "hat_beanie"
COLOR = "#FF9F45"
CENTRE = (0.0, 0.012, 0.0)
RADII = (kit.HX + 0.032, kit.HY + 0.034, kit.HZ + 0.078)
TOP = CENTRE[2] + RADII[2]
POM = Vector((0.0, 0.03, TOP + 0.042))
META = dict(
    name="Beanie", category="character-hat", priority="P0",
    description="Ribbed knit beanie with a folded cuff and a bouncy pom-pom (node Pom)",
    tags=["hat", "beanie", "winter", "jiggle"], tintable=["Accent"],
    anchors_bl={"hatBand": (0, -0.31, 0.141), "headTop": tuple(POM + Vector((0, 0, 0.07))),
                "pomBase": (0, 0.03, TOP - 0.01)},
    nodes={"Pom": "jiggle: rotate about its origin (the pom's base)"},
)


def band(P):
    # Tilted back like the rig's hatBand ring, so the brows stay in view.
    return 0.076 - 0.21 * P[:, 1]


def knit(P):
    _, phi, _ = kit.sph_angles(P, CENTRE)
    dome = kit.sd_ellipsoid(P, CENTRE, RADII) + 0.0026 * np.cos(np.radians(phi) * 26)
    cuff = kit.sd_ellipsoid(P, CENTRE, [r + 0.02 for r in RADII])
    cuff += 0.0032 * np.cos(np.radians(phi) * 34)
    cuff = kit.smax(cuff, np.abs(P[:, 2] - band(P) - 0.038) - 0.038, 0.008)
    d = kit.smin(dome, cuff, 0.003)
    return kit.smax(d, band(P) - P[:, 2], 0.012)


def pom(P):
    rnd = np.random.default_rng(4)
    cs = [tuple(POM + Vector(d) * 0.05) for d in kit.fib_dirs(14, seed=2)]
    rs = [rnd.uniform(0.028, 0.034) for _ in cs]
    return kit.smin(kit.sd_sphere(P, tuple(POM), 0.058), kit.sd_spheres(P, cs, rs, 0.012), 0.012)


def build():
    lib.begin(NAME)
    M = dict(knit=kit.m_accent(COLOR, rough=0.85), pom=kit.flat("Pom", "#FFF6E8", rough=0.9),
             label=kit.flat("Label_Leather", "#8D5A3A", rough=0.6))
    kit.sdf_mesh("Beanie", knit, (-0.36, -0.37, -0.06), (0.36, 0.37, 0.4), M["knit"],
                 voxel=0.0035, trim=kit.outside_head(), target=1500, remesh="decimate")
    p = kit.sdf_mesh("Pom", pom, tuple(POM - Vector((0.1, 0.1, 0.1))),
                     tuple(POM + Vector((0.1, 0.1, 0.1))), M["pom"], voxel=0.003, target=380,
                     remesh="decimate")
    lib.node(p, "Pom", pivot=(0.0, 0.03, TOP - 0.01))
    # A little leather label stitched on the cuff, front left.
    d = kit.sph_dir(66, 38)
    at = kit.surface_point(knit, d, centre=CENTRE) + d * 0.006
    tag = lib.rbox("Tag", (0.05, 0.008, 0.034), tuple(at), M["label"], r=0.005, seg=2)
    kit.place(tag, at, kit.frame_from(d))


def finalize(name):
    return kit.finalize(name, META, mount="head", ao_distance=0.08)
