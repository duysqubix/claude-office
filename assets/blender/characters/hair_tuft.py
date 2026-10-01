"""Tuft: a bald head's single sprout of hair: a little flame of three fat teardrop locks in a
row front to back, each curling forward at the tip, the middle one tallest. The locks are their own node `Tuft` pivoting at the crown, so the game can
jiggle them; the patch stays put. `Hair`. Pivot at the head centre."""
from mathutils import Vector

from characters import _kit as kit

import lib

NAME = "hair_tuft"
CROWN = kit.head_point((0, 0.06, 1.0))
UP = CROWN.normalized()
META = dict(
    name="Tuft", category="character-hair", priority="P0",
    description="A cheeky three-lock sprout on a bald crown; node Tuft jiggles at the crown",
    tags=["hair", "tuft", "bald", "jiggle"], tintable=["Hair"],
    anchors_bl={"headTop": tuple(CROWN + UP * 0.17), "tuftBase": tuple(CROWN)},
    nodes={"Tuft": "jiggle: rotate about its origin (the crown)"},
)
COLOR = "#E8C07D"


def lock(P, pts, radii):
    return kit.sd_lock(P, [tuple(CROWN + Vector(p)) for p in pts], radii, k=0.012)


def locks(P):
    # A flame: three locks in a row front to back, each curling forward at the tip.
    d = lock(P, [(0.0, 0.002, -0.02), (0.0, -0.012, 0.085), (0.0, -0.05, 0.152),
                 (0.0, -0.098, 0.15)], [0.05, 0.042, 0.022, 0.011])
    d = kit.smin(d, lock(P, [(0.012, 0.036, -0.02), (0.016, 0.044, 0.055), (0.012, 0.012, 0.11),
                             (0.008, -0.022, 0.118)], [0.04, 0.033, 0.018, 0.009]), 0.016)
    d = kit.smin(d, lock(P, [(-0.01, -0.036, -0.02), (-0.012, -0.062, 0.045),
                             (-0.01, -0.1, 0.064)], [0.036, 0.026, 0.01]), 0.016)
    return d


def patch(P):
    # Hidden inside the tuft's base: the static root the AO bake needs.
    return kit.sd_ellipsoid(P, tuple(CROWN), (0.034, 0.034, 0.012), kit.look(UP))


def build():
    lib.begin(NAME)
    M = kit.m_hair(COLOR)
    lo = CROWN - Vector((0.13, 0.14, 0.05))
    hi = CROWN + Vector((0.13, 0.09, 0.2))
    kit.sdf_mesh("Patch", patch, lo, hi, M, voxel=0.003, trim=kit.outside_head(), target=120)
    t = kit.sdf_mesh("Tuft", locks, lo, hi, M, voxel=0.0025, trim=kit.outside_head(),
                     target=1500)
    lib.node(t, "Tuft", pivot=tuple(CROWN))


def finalize(name):
    return kit.finalize(name, META, mount="head", ao_distance=0.05)
