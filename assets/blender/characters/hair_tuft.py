"""Tuft: a bald head's single sprout of hair, rig.ts's three-blob tuft sculpted: a fat egg
leaning forward with two smaller ones splaying out, melted together at the root. The locks are their own node `Tuft` pivoting at the crown, so the game can
jiggle them; the patch stays put. `Hair`. Pivot at the head centre."""
import math

from mathutils import Vector

from characters import _kit as kit

import lib

NAME = "hair_tuft"
CROWN = kit.head_point((0, 0.0, 1.0))
UP = CROWN.normalized()
META = dict(
    name="Tuft", category="character-hair", priority="P0",
    description="A cheeky three-lock sprout on a bald crown; node Tuft jiggles at the crown",
    tags=["hair", "tuft", "bald", "jiggle"], tintable=["Hair"],
    anchors_bl={"headTop": tuple(CROWN + UP * 0.17), "tuftBase": tuple(CROWN)},
    nodes={"Tuft": "jiggle: rotate about its origin (the crown)"},
)
COLOR = "#E8C07D"


SIZE = 1.4  # rig.ts proportions, scaled up about the crown so it reads at a distance


def egg(P, centre, direction, back, front, r_back, r_front):
    d = Vector(direction).normalized()
    c = CROWN + (Vector(centre) - Vector((0, 0, kit.HZ))) * SIZE
    return kit.sd_round_cone(P, tuple(c - d * back * SIZE), tuple(c + d * front * SIZE),
                             r_back * SIZE, r_front * SIZE)


def locks(P):
    # rig.ts's tuft, sculpted: a fat middle egg leaning forward, two smaller ones splaying
    # out to the sides, all melted together at the root.
    t = 0.35
    d = egg(P, (0, -0.035, 0.252), (0, -math.sin(t), math.cos(t)), 0.03, 0.075, 0.056, 0.026)
    for s in (1, -1):
        a = 0.6
        d = kit.smin(d, egg(P, (s * 0.045, 0.008, 0.24), (s * math.sin(a), 0.1, math.cos(a)),
                            0.02, 0.058, 0.043, 0.02), 0.025)
    return d


def patch(P):
    # Hidden inside the tuft's base: the static root the AO bake needs.
    return kit.sd_ellipsoid(P, tuple(CROWN), (0.02, 0.02, 0.01), kit.look(UP))


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
