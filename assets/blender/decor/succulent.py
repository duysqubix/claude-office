"""Succulent: a tiny desk echeveria. Three rings of plump, pointed, cupped leaves (paler
toward the heart) in a chunky glazed pot (tintable `Accent`) with a rolled rim. 0.11 m tall;
origin at the desk-contact centre."""
import math

import lib
from decor import _decor as D
from decor import _desk as K

NAME = "succulent"
AO_RES = 256
AO_DISTANCE = 0.025
META = dict(
    name="Succulent", category="plant", priority="P1",
    description="Tiny echeveria rosette of plump leaves in a chunky glazed pot",
    tags=["desk", "plant", "clutter"], tintable=["Accent"],
    anchors_bl={"top": (0, 0, 0.108)},
)
SOIL = 0.062
# (count, base radius, length, width, thickness, tilt degrees, material key) outer → inner
RINGS = [(7, 0.012, 0.043, 0.028, 0.01, 15, "leaf"),
         (6, 0.008, 0.035, 0.024, 0.01, 35, "leaf"),
         (4, 0.004, 0.026, 0.019, 0.0095, 58, "leafLight")]


def materials():
    return dict(
        pot=D.mat("Accent", "pink", rough=0.4),
        soil=D.mat("Soil", "soil", rough=0.95),
        leaf=D.mat("Leaf", "#6CCB96", rough=0.55),
        leafLight=D.mat("LeafLight", "#A6E3BE", rough=0.55),
    )


def pot(M):
    prof = [(0.0, 0.0), (0.03, 0.0), (0.0345, 0.0028), (0.0375, 0.01), (0.041, 0.05),
            (0.045, 0.053), (0.0478, 0.0585), (0.048, 0.066), (0.0458, 0.0705),
            (0.0425, 0.0712), (0.0403, 0.0685), (0.0396, SOIL + 0.002), (0.0392, SOIL),
            (0.0, SOIL)]
    p = D.lathe("Pot", prof, M["pot"], verts=24, sharp=55)
    D.paint(p, M["soil"], lambda c, n: abs(c.z - SOIL) < 0.0005 and n.z > 0.9)


def rosette(M):
    golden = math.radians(137.5)
    k = 0
    for ring, (count, r0, length, width, thick, tilt, key) in enumerate(RINGS):
        for i in range(count):
            yaw = i * 2 * math.pi / count + ring * golden
            e = math.radians(tilt)
            base = (r0 * math.cos(yaw), r0 * math.sin(yaw), SOIL - 0.002 + ring * 0.006)
            K.leaf(f"Leaf{k}", length, width, thick, M[key], cup=0.7, curl=0.1, u=12, v=7,
                   loc=base, rot=(e, 0, yaw - math.pi / 2))
            k += 1


def build():
    lib.begin(NAME)
    M = materials()
    pot(M)
    rosette(M)


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META)
