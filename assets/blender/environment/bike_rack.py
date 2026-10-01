"""Bike rack: three chunky sunny-yellow hoops (Sheffield stands) bolted to two floor rails.
2.0 m long, 0.8 m tall; bikes park alongside each hoop. Origin at the ground centre."""
import math

import lib
from environment import _env

NAME = "bike_rack"
AO_RES = 512
AO_DISTANCE = 0.2

HOOP_W = 0.62
HOOP_H = 0.8
R = 0.035


def materials():
    return dict(
        paint=lib.mat("Paint", "#FFC93C", rough=0.45),
        base=lib.mat("Base", "#5A6577", rough=0.55),
    )


def hoop(name, x, M):
    pts = [(x, -HOOP_W / 2, 0.02), (x, -HOOP_W / 2, HOOP_H - 0.2)]
    for k in range(1, 12):
        a = math.pi * k / 12
        pts.append((x, -HOOP_W / 2 * math.cos(a), HOOP_H - 0.2 + 0.2 * math.sin(a)))
    pts += [(x, HOOP_W / 2, HOOP_H - 0.2), (x, HOOP_W / 2, 0.02)]
    _env.sweep_tube(name, pts, R, M["paint"], verts=14)
    for sgn in (-1, 1):
        lib.cyl(f"{name}Foot{sgn}", 0.06, 0.03, (x, sgn * HOOP_W / 2, 0.035), M["base"],
                r=0.01, seg=1, verts=16)


def build():
    lib.begin(NAME)
    M = materials()
    for i, x in enumerate((-0.75, 0.0, 0.75)):
        hoop(f"Hoop{i}", x, M)
    for sgn in (-1, 1):
        lib.rbox(f"Rail{sgn}", (2.0, 0.09, 0.04), (0, sgn * HOOP_W / 2, 0.02), M["base"],
                 r=0.015, seg=2)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE)
