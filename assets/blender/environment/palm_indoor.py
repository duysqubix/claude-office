"""Indoor palm: three slim canes in a ribbed woven basket, crowned by eight arching fronds,
each a drooping rachis with pairs of slender leaflets. About 1.5 m tall. Origin at the floor
centre of the basket."""
import math

import lib
from environment import _env

NAME = "palm_indoor"
AO_RES = 512
AO_DISTANCE = 0.2

SOIL_Z = 0.4


def materials():
    return dict(
        basket=lib.mat("Basket", "#D9AE73", rough=0.85),
        basketDark=lib.mat("BasketBand", "#B98A52", rough=0.85),
        soil=lib.mat("Soil", "#6B4A32", rough=0.95),
        cane=lib.mat("Cane", "#7FA650", rough=0.6),
        rachis=lib.mat("Rachis", "#4E9A45", rough=0.6),
        leaves=[lib.mat("Leaflet", "#4CB85A", rough=0.55),
                lib.mat("LeafletDark", "#3A9E4E", rough=0.55),
                lib.mat("LeafletLight", "#6CCB63", rough=0.55)],
    )


def basket(M):
    # Woven ribs: the profile bulges every 4.5 cm.
    prof = [(0.0, 0.0), (0.2, 0.0), (0.225, 0.015)]
    for k in range(8):
        z = 0.03 + k * 0.045
        r = 0.235 + k * 0.009
        prof += [(r, z), (r + 0.014, z + 0.022)]
    prof += [(0.31, 0.39), (0.0, 0.39)]
    lib.lathe("Basket", prof, material=M["basket"], verts=40)
    rim = [(0.29, 0.38), (0.318, 0.382), (0.334, 0.4), (0.33, 0.425), (0.31, 0.435),
           (0.29, 0.425), (0.29, 0.38)]
    lib.lathe("BasketRim", rim, material=M["basketDark"], verts=40)
    lib.cyl("Soil", 0.29, 0.02, (0, 0, SOIL_Z), M["soil"], r=0.006, seg=1, verts=36)


def canes_and_fronds(M):
    tops = []
    for c, (ox, oy, h) in enumerate(((-0.05, 0.03, 0.62), (0.06, 0.02, 0.5), (0.0, -0.06, 0.72))):
        top = (ox * 1.6, oy * 1.6, SOIL_Z + h)
        _env.tube(f"Cane{c}", (ox, oy, SOIL_Z - 0.02), top, 0.026, 0.018, M["cane"], verts=10)
        tops.append(top)
    for i in range(8):
        yaw = i * math.radians(137.5) + 0.3
        pitch = math.radians(58 - 4 * (i % 4))
        _env.pinnate_frond(f"Frond{i}_", tops[i % 3], yaw, pitch, 0.78 + 0.08 * (i % 3),
                           0.32 + 0.04 * (i % 2), M["rachis"], M["leaves"], pairs=9,
                           leaflet=(0.1, 0.2), width=0.04, seed=i)


def build():
    lib.begin(NAME)
    M = materials()
    basket(M)
    canes_and_fronds(M)


META = dict(
    name="Indoor palm",
    category="plant",
    priority="P1",
    description=("Three slim canes in a ribbed woven basket, crowned by arching fronds of slender "
                 "leaflets"),
    tags=["plant", "indoor", "decor", "pot", "palm"],
    tintable=[],
    anchors={},
)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META)
