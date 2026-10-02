"""Ponytail: hair combed back off the face into a high ponytail. A snug helmet with a soft
rounded hairline and shallow comb grooves running back to a plump `Accent` scrunchie high on
the back of the crown; the tail is its own node `Ponytail`, a fat grooved lock that arcs out
and falls behind the head, pivoting at the tie so the game can swing it. `Hair` (+ `Accent`
tie). SDF-sculpted (see _kit, _lorrain). Pivot at the head centre."""
import numpy as np
from mathutils import Vector

from characters import _kit as kit
from characters import _lorrain as lo

import lib

NAME = "hair_ponytail"
COLOR = "#E8C07D"
TIE = kit.head_point(kit.sph_dir(38, 180), out=0.04)   # high on the back of the crown
OUT = TIE.normalized()
# The tail: up and out of the tie, arcing back over and falling behind the head.
TAIL, TAIL_R = lo.smooth_lock(
    [TIE - OUT * 0.012, (0, 0.25, 0.3), (0, 0.34, 0.27), (0, 0.39, 0.13), (0, 0.38, -0.03),
     (0, 0.34, -0.15)],
    [0.05, 0.072, 0.08, 0.072, 0.056, 0.02])
RAILS = lo.lock_rails(TAIL, TAIL_R, away_from=(0, 0.1, 0))
META = lo.meta(
    "Ponytail", "character-hair", "P1",
    "Hair combed back into a high ponytail with a coloured tie; node Ponytail swings",
    ["hair", "ponytail", "long", "swing"], ["Hair", "Accent"],
    anchors_bl={"headTop": (0, 0, kit.HZ + 0.03), "tie": tuple(TIE)},
    nodes={"Ponytail": "swing: rotate about its origin (the hair tie)"},
)


def edge(phi):
    """Hairline: theta (deg from the crown) where the hair ends, around the head."""
    a = np.abs(phi)
    front = 50.0 + 0.0024 * phi ** 2
    side = 98.0 + 6.0 * kit.ramp(a, 95, 130)
    e = front + (side - front) * kit.ramp(a, 45, 75)
    return e + (112.0 - e) * kit.ramp(a, 130, 170)


def base(P):
    S = kit
    d = S.sd_ellipsoid(P, (0, 0.008, 0.012), (kit.HX + 0.016, kit.HY + 0.02, kit.HZ + 0.024))
    # Hair gathered into the tie: a soft swell under it.
    d = S.smin(d, S.sd_ellipsoid(P, tuple(TIE - OUT * 0.035), (0.06, 0.05, 0.06),
                                 S.look(OUT)), 0.04)
    return S.smax(d, S.sd_hairline(P, edge), 0.02)


# Comb lines fanning from just in front of the crown to just short of the hairline (the hair
# is pulled back, so the edge stays smooth: no fringe notches); they start apart, so they
# never crowd into a pit at the crown.
GROOVES = ([[(18, ph * 0.45), (30, ph * 0.7), (45, ph)] for ph in (-48, -24, 0, 24, 48)] +
           [[(46, 180 - s * 22), (76, s * 125), (88, s * 84)] for s in (1, -1)] +
           [[(46, 180 + s * 6), (70, 180 + s * 16), (100, 180 + s * 36)] for s in (1, -1)])


def build():
    lib.begin(NAME)
    M = kit.m_hair(COLOR)
    kit.hair_mesh("Ponytail", lo.soft_carve(base, GROOVES), COLOR, target=1150)
    t = kit.sdf_mesh("PonytailLock", lambda P: lo.sd_grooved_lock(P, TAIL, TAIL_R, RAILS),
                     (-0.14, 0.08, -0.26), (0.14, 0.5, 0.42), M, voxel=0.0028, target=720,
                     remesh="decimate")
    lib.node(t, "Ponytail", pivot=tuple(TIE))
    kit.sdf_mesh("Tie", lambda P: lo.sd_scrunchie(P, TIE, OUT),
                 TIE - Vector((0.08, 0.08, 0.08)), TIE + Vector((0.08, 0.08, 0.08)),
                 kit.m_accent(), voxel=0.002, target=150, remesh="decimate")


def finalize(name):
    return kit.finalize(name, META, mount="head", ao_distance=0.08)
