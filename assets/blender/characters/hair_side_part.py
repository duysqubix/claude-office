"""Side part: the neat "nice boy" cut. A deep parting groove on the character's right, the
top swept across in one plump swoop that lifts at the front, short tidy sides with little
sideburns, a soft nape, and comb grooves fanning from the part. `Hair`. SDF-sculpted (see
_kit). Pivot at the head centre."""
import numpy as np

from characters import _kit as kit

import lib

NAME = "hair_side_part"
META = dict(
    name="Side part", category="character-hair", priority="P0",
    description="Neat short cut with a deep side parting and a plump swept fringe",
    tags=["hair", "short", "side-part", "neat"], tintable=["Hair"],
    anchors_bl={"headTop": (0, 0, kit.HZ + 0.05)},
)
COLOR = "#5A3825"
PART = -38  # phi of the parting (character-right)


def edge(phi):
    a = np.abs(phi)
    front = 50.0 + 0.0022 * phi ** 2 + kit.bumps(phi, [-34, 34], 9.0, 5.0)  # soft temples
    side = 101.0 + 4.0 * kit.ramp(a, 95, 130)
    nape = 113.0
    e = front + (side - front) * kit.ramp(a, 48, 74)
    return e + (nape - e) * kit.ramp(a, 130, 170)


def base(P):
    S = kit
    d = S.sd_ellipsoid(P, (0, 0.012, 0.016), (kit.HX + 0.018, kit.HY + 0.024, kit.HZ + 0.038))
    # The swoop: a plump mass swept from the part across to character-left, lifting at the
    # front like a soft wave.
    d = S.smin(d, S.sd_ellipsoid(P, (0.03, -0.11, 0.2), (0.19, 0.12, 0.085),
                                 S.rot3(0.55, 0.0, -0.18)), 0.05)
    d = S.smin(d, S.sd_ellipsoid(P, (0.07, -0.19, 0.12), (0.13, 0.07, 0.07),
                                 S.rot3(0.9, 0.0, -0.25)), 0.04)
    return S.smax(d, S.sd_hairline(P, edge), 0.02)


GROOVES = [
    [(18, PART - 6), (40, PART), (60, PART + 2)],                 # the parting
    [(30, PART + 8), (22, 5), (38, 52)],                          # comb lines off the part
    [(42, PART + 12), (34, 10), (46, 48)],
    [(22, PART - 10), (14, 70), (40, 112)],
    [(50, 150), (80, 160), (106, 168)],
    [(50, 210), (80, 200), (106, 192)],
]


def build():
    lib.begin(NAME)
    fn = kit.carved(base, GROOVES)
    kit.hair_mesh("SidePart", fn, COLOR)


def finalize(name):
    return kit.finalize(name, META, mount="head", ao_distance=0.08)
