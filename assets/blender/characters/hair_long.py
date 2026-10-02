"""Long: long, straight hair with a middle parting. A full helmet over the crown flows into a
curtain that frames the face to the jaw on both sides and falls down the back to the
shoulder blades, ending in chunky rounded tips; shallow strand grooves run from the parting
down to the tips. The curtain is hollow, so the neck and shoulders stay clear, and stops at
the jaw at the sides so the arms swing free. `Hair`. SDF-sculpted (see _kit, _lorrain).
Pivot at the head centre."""
import numpy as np

from characters import _kit as kit
from characters import _lorrain as lo

import lib

NAME = "hair_long"
COLOR = "#A0522D"
OUTER = kit.R + 0.032      # outer radius of the hair shell
INNER = kit.R - 0.024      # radius of the hollow under the head
CY = 0.03                  # the curtain's axis sits a little behind the head centre
DEEP = 1.05                # the curtain is a touch deeper front to back than wide
STRANDS = (70, 96, 122, 146, 168)
META = lo.meta(
    "Long", "character-hair", "P1",
    "Long straight hair with a middle parting, to the shoulder blades, chunky rounded tips",
    ["hair", "long", "straight"], ["Hair"],
    anchors_bl={"headTop": (0, 0, kit.HZ + 0.035)},
)


def bottom(phi):
    """z of the lower edge: jaw level at the sides, shoulder blades at the back, scalloped."""
    a = np.abs(phi)
    z = -0.26 + (-0.43 + 0.26) * kit.ramp(a, 105, 165)
    return z + 0.014 * np.cos(np.radians(phi) * 9.0)


def edge(phi):
    a = np.abs(phi)
    front = 50.0 + 0.002 * phi ** 2
    return front + (180.0 - front) * kit.ramp(a, 56, 86)    # open face, full sides and back


def hair(P):
    S = kit
    top = S.sd_ellipsoid(P, (0, 0.012, 0.014), (OUTER, OUTER + 0.004, OUTER + 0.002))
    x, y, z = P[:, 0], P[:, 1] - CY, P[:, 2]
    rr = np.sqrt(x * x + (y / DEEP) ** 2)
    phi = np.degrees(np.arctan2(P[:, 0], -P[:, 1]))
    curtain = np.maximum(rr - OUTER, z - 0.0)
    d = S.smin(top, curtain, 0.05)
    d = S.smax(d, bottom(phi) - z, 0.035)                     # rounded tips
    hollow = np.maximum(rr - INNER, z + 0.02)                 # clear the neck, under the head
    d = S.smax(d, -hollow, 0.02)
    return S.smax(d, S.sd_hairline(P, edge), 0.02)


# The parting, and strand grooves over the head down to where the curtain begins.
UPPER = ([[(52, 0), (30, 0), (10, 0), (8, 180)]] +
         [[(16, s * ph * 0.5), (50, s * ph), (84, s * ph)] for s in (1, -1) for ph in STRANDS])


def lower_rails():
    """Strand grooves down the hanging curtain, laid just above its outer surface."""
    rails = []
    for s in (1, -1):
        for ph in STRANDS:
            p = np.radians(s * ph)
            r = OUTER + 0.0028
            zb = float(bottom(np.array([s * ph]))[0]) + 0.075
            rails.append([(np.sin(p) * r, CY - np.cos(p) * r * DEEP, z)
                          for z in np.linspace(-0.035, zb, 10)])
    return rails


LOWER = lower_rails()


def carved(P):
    d = lo.soft_carve(hair, UPPER)(P)
    for rail in LOWER:
        d = kit.smax(d, -kit.sd_groove(P, rail, 0.0055, 0.0065), 0.005)
    return d


def build():
    lib.begin(NAME)
    kit.hair_mesh("Long", carved, COLOR, lo=(-0.38, -0.36, -0.5), hi=(0.38, 0.4, 0.36),
                  voxel=0.0038, target=2200)


def finalize(name):
    return kit.finalize(name, META, mount="head", ao_distance=0.08)
