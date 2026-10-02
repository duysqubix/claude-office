"""Pigtails: two bouncy bunches. A snug helmet with a soft scalloped fringe across the
forehead and shallow grooves sweeping down to plump `Accent` scrunchies just behind each
ear; each bunch is a fat grooved lock that kicks out sideways and curls down, its own node
(`PigtailL` on the character's left, `PigtailR`) pivoting at its tie so the game can bounce
them. `Hair` (+ `Accent` ties). SDF-sculpted (see _kit, _lorrain). Pivot at the head
centre."""
import numpy as np
from mathutils import Vector

from characters import _kit as kit
from characters import _lorrain as lo

import lib

NAME = "hair_pigtails"
COLOR = "#D94F30"
TIPS = [-34, -12, 12, 34]          # fringe tips (phi, degrees)
DOWN = Vector((0, 0, -1))


def side(s):
    """Tie, its outward axis, and the bunch's curve for side s (+1 = character-left)."""
    tie = kit.head_point(kit.sph_dir(80, s * 104), out=0.032)
    out = tie.normalized()
    flat = Vector((out.x, out.y, 0)).normalized()
    pts, radii = lo.smooth_lock(
        [tie - out * 0.014, tie + flat * 0.07 + DOWN * 0.0, tie + flat * 0.12 + DOWN * 0.06,
         tie + flat * 0.13 + DOWN * 0.14, tie + flat * 0.105 + DOWN * 0.2],
        [0.05, 0.072, 0.078, 0.062, 0.02])
    rails = [r[:-3] for r in lo.lock_rails(pts, radii, away_from=(0, 0, 0))]
    return tie, out, pts, radii, rails


SIDES = {s: side(s) for s in (1, -1)}
META = lo.meta(
    "Pigtails", "character-hair", "P1",
    "Two bouncy pigtails with coloured scrunchies and a scalloped fringe; nodes PigtailL/R",
    ["hair", "pigtails", "bunches", "swing"], ["Hair", "Accent"],
    anchors_bl={"headTop": (0, 0, kit.HZ + 0.03), "tieL": tuple(SIDES[1][0]),
                "tieR": tuple(SIDES[-1][0])},
    nodes={"PigtailL": "bounce: rotate about its origin (the character-left tie)",
           "PigtailR": "bounce: rotate about its origin (the character-right tie)"},
)


def edge(phi):
    a = np.abs(phi)
    fringe = 60.0 + 0.0022 * phi ** 2 + kit.bumps(phi, TIPS, 7.0, 5.0)
    side = 100.0 + 6.0 * kit.ramp(a, 95, 130)
    e = fringe + (side - fringe) * kit.ramp(a, 48, 76)
    return e + (112.0 - e) * kit.ramp(a, 130, 170)


def helmet(P):
    S = kit
    d = S.sd_ellipsoid(P, (0, 0.008, 0.012), (kit.HX + 0.02, kit.HY + 0.022, kit.HZ + 0.026))
    for s in (1, -1):
        tie, out = SIDES[s][0], SIDES[s][1]
        d = S.smin(d, S.sd_ellipsoid(P, tuple(tie - out * 0.03), (0.055, 0.05, 0.055),
                                     S.look(out)), 0.035)
    return S.smax(d, S.sd_hairline(P, edge), 0.02)


# Grooves from the crown sweeping down to each tie, and short ones above the fringe notches.
GROOVES = ([[(10, s * 70), (40, s * 92), (66, s * 100)] for s in (1, -1)] +
           [[(18, s * 140), (52, s * 128), (70, s * 112)] for s in (1, -1)] +
           [[(16, s * 30), (46, s * 74), (68, s * 94)] for s in (1, -1)] +
           [[(28, ph * 0.5), (50, ph)] for ph in (-23, 0, 23)])


def build():
    lib.begin(NAME)
    M = kit.m_hair(COLOR)
    kit.hair_mesh("Pigtails", lo.soft_carve(helmet, GROOVES), COLOR, target=1050)
    for s, node in ((1, "PigtailL"), (-1, "PigtailR")):
        tie, out, pts, radii, rails = SIDES[s]
        box_lo = Vector([min(p[i] for p in pts) - 0.08 for i in range(3)])
        box_hi = Vector([max(p[i] for p in pts) + 0.08 for i in range(3)])
        t = kit.sdf_mesh(node + "Lock",
                         lambda P, pts=pts, radii=radii, rails=rails:
                         lo.sd_grooved_lock(P, pts, radii, rails),
                         box_lo, box_hi, M, voxel=0.0028, target=420, remesh="decimate")
        lib.node(t, node, pivot=tuple(tie))
        kit.sdf_mesh(f"Tie{node[-1]}", lambda P, tie=tie, out=out: lo.sd_scrunchie(P, tie, out),
                     tie - Vector((0.08, 0.08, 0.08)), tie + Vector((0.08, 0.08, 0.08)),
                     kit.m_accent(), voxel=0.002, target=120, remesh="decimate")


def finalize(name):
    return kit.finalize(name, META, mount="head", ao_distance=0.08)
