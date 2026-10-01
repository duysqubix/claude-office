"""Ponytail: hair combed back off the face into a high ponytail. A snug helmet with a soft
rounded hairline and comb grooves running back to an `Accent` hair tie at the back of the
crown; the tail is its own node `Ponytail`, a fat grooved lock that swings out and falls
behind the head, pivoting at the tie so the game can swing it. `Hair` (+ `Accent` tie).
SDF-sculpted (see _kit). Pivot at the head centre."""
import numpy as np
from mathutils import Vector

from characters import _kit as kit

import lib

NAME = "hair_ponytail"
COLOR = "#E8C07D"
TIE = kit.head_point(kit.sph_dir(38, 180), out=0.04)   # high on the back of the crown
OUT = TIE.normalized()
# The tail: up and out of the tie, arcing back over and falling behind the head.
TAIL = [TIE - OUT * 0.012, (0, 0.25, 0.3), (0, 0.34, 0.27), (0, 0.39, 0.13), (0, 0.38, -0.03),
        (0, 0.34, -0.15)]
TAIL = [Vector(p) for p in TAIL]
TAIL_R = [0.05, 0.072, 0.08, 0.072, 0.056, 0.02]
META = dict(
    name="Ponytail", category="character-hair", priority="P1", artist="Claude Lorrain",
    description="Hair combed back into a high ponytail with a coloured tie; node Ponytail swings",
    tags=["hair", "ponytail", "long", "swing"], tintable=["Hair", "Accent"],
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


# Comb lines from the tie forward over the head, fading out just short of the hairline
# (the hair is pulled back, so the edge stays smooth: no fringe notches).
GROOVES = ([[(34, 180 - ph * 0.12), (16, 180 - ph * 0.5), (24, ph * 0.6), (45, ph)]
            for ph in (-48, -24, 0, 24, 48)] +
           [[(46, 180 - s * 22), (76, s * 125), (88, s * 84)] for s in (1, -1)] +
           [[(46, 180 + s * 6), (70, 180 + s * 16), (100, 180 + s * 36)] for s in (1, -1)])


def _smooth_tail(samples=22):
    """The tail as a dense smooth curve with smoothly interpolated radii."""
    pts = kit.catmull([tuple(p) for p in TAIL], samples)
    n = len(TAIL) - 1
    radii = []
    for i in range(len(pts)):
        u = i / (len(pts) - 1) * n
        k = min(int(u), n - 1)
        f = u - k
        f = f * f * (3 - 2 * f)
        radii.append(TAIL_R[k] + (TAIL_R[k + 1] - TAIL_R[k]) * f)
    return [Vector(p) for p in pts], radii


TAIL_PTS, TAIL_RADII = _smooth_tail()


def tie(P):
    # A plump scrunchie.
    return kit.sd_torus(P, tuple(TIE), 0.044, 0.022, kit.look(OUT))


def tail(P):
    d = kit.sd_lock(P, [tuple(p) for p in TAIL_PTS], TAIL_RADII, k=0.01)
    # Grooves running down the lock: along both sides and its outer (back/top) face.
    rails = {0: [], 1: [], 2: []}
    for i in range(3, len(TAIL_PTS) - 2):
        p, r = TAIL_PTS[i], TAIL_RADII[i]
        t = (TAIL_PTS[i + 1] - TAIL_PTS[i - 1]).normalized()
        n = t.cross(Vector((1, 0, 0))).normalized()
        if n.dot(p - Vector((0, 0.1, 0.0))) < 0:
            n = -n
        for k, side in enumerate((Vector((1, 0, 0)), Vector((-1, 0, 0)), n)):
            rails[k].append(tuple(p + side * (r + 0.002)))
    # Wide, shallow channels: they survive decimation without sliver triangles.
    for pts in rails.values():
        d = kit.smax(d, -kit.sd_groove(P, pts, 0.0055, 0.0065), 0.004)
    return d


def build():
    lib.begin(NAME)
    M = kit.m_hair(COLOR)
    fn = kit.carved(base, GROOVES, r0=0.004, r1=0.0068, sink=-0.0028, extend=0.0, k=0.005)
    kit.hair_mesh("Ponytail", fn, COLOR, target=1250)
    lo = Vector((-0.14, 0.08, -0.26))
    hi = Vector((0.14, 0.5, 0.42))
    t = kit.sdf_mesh("PonytailLock", tail, lo, hi, M, voxel=0.0028, target=820,
                     remesh="decimate")
    lib.node(t, "Ponytail", pivot=tuple(TIE))
    kit.sdf_mesh("Tie", tie, TIE - Vector((0.07, 0.07, 0.07)), TIE + Vector((0.07, 0.07, 0.07)),
                 kit.m_accent(), voxel=0.002, target=180, remesh="decimate")


def finalize(name):
    return kit.finalize(name, META, mount="head", ao_distance=0.08)
