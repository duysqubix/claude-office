"""Bicycle: a chunky step-through city bike with an `Accent` frame and mudguards, fat tyres
with five-spoke wheels, a cushy saddle, swept-back bars and a wicker basket up front, standing
on its kickstand. It rides toward -Y. 1.9 m long, about 1 m tall. Origin on the ground
between the wheels."""
import math

import lib
from environment import _env

NAME = "bicycle"
AO_RES = 512
AO_DISTANCE = 0.15

WHEEL_R = 0.33
REAR = (0.0, 0.56, WHEEL_R)
FRONT = (0.0, -0.56, WHEEL_R)
BB = (0.0, 0.04, 0.3)          # bottom bracket
SEAT = (0.0, 0.2, 0.86)
HEAD_LO = (0.0, -0.4, 0.62)
HEAD_HI = (0.0, -0.44, 0.8)


def materials():
    return dict(
        frame=lib.mat("Accent", lib.P["chairs"][3], rough=0.4),
        tyre=lib.mat("Tyre", "#2B2D42", rough=0.8),
        metal=lib.mat("Metal", lib.P["metal"], rough=0.4, metal=0.4),
        seat=lib.mat("Saddle", "#6B3E26", rough=0.6),
        grip=lib.mat("Grip", "#6B3E26", rough=0.6),
        wicker=lib.mat("Wicker", "#D9AE73", rough=0.85),
    )


def wheel(name, c, M):
    lib.torus(f"{name}Tyre", WHEEL_R - 0.04, 0.042, c, M["tyre"], seg=28, ring=8,
              rot=(0, math.pi / 2, 0))
    lib.torus(f"{name}Rim", WHEEL_R - 0.075, 0.014, c, M["metal"], seg=24, ring=6,
              rot=(0, math.pi / 2, 0))
    lib.cyl(f"{name}Hub", 0.04, 0.09, c, M["metal"], r=0.012, seg=1, verts=12,
            rot=(0, math.pi / 2, 0))
    for k in range(5):
        a = 2 * math.pi * k / 5 + 0.3
        lib.rbox(f"{name}Spoke{k}", (0.012, 0.016, WHEEL_R - 0.09),
                 (c[0], c[1] + math.cos(a) * (WHEEL_R - 0.09) / 2,
                  c[2] + math.sin(a) * (WHEEL_R - 0.09) / 2), M["metal"], r=0.005, seg=1,
                 rot=(a - math.pi / 2, 0, 0))


def frame(M):
    t = M["frame"]
    _env.sweep_tube("Chainstay", [REAR, BB], 0.022, t, verts=10)
    _env.sweep_tube("SeatTube", [BB, (0, 0.15, 0.62), (0, 0.18, 0.78)], 0.028, t, verts=10)
    _env.sweep_tube("SeatStay", [REAR, (0, 0.24, 0.66)], 0.02, t, verts=10)
    # Step-through: one swooping down tube from the bottom bracket to the head tube.
    _env.sweep_tube("DownTube", [(0, 0.08, 0.32), (0, -0.12, 0.33), (0, -0.3, 0.45), HEAD_LO],
                    0.032, t, verts=12)
    _env.sweep_tube("HeadTube", [HEAD_LO, HEAD_HI], 0.036, t, verts=12)
    _env.sweep_tube("Fork", [HEAD_LO, (0, -0.5, 0.48), FRONT], 0.022, t, verts=10)
    # Mudguards hugging the top of each wheel.
    for name, c, a0, a1 in (("GuardR", REAR, 10, 165), ("GuardF", FRONT, 20, 160)):
        pts = []
        for k in range(10):
            a = math.radians(a0 + (a1 - a0) * k / 9)
            rr = WHEEL_R + 0.03
            pts.append((0, c[1] + math.cos(a) * rr, c[2] + math.sin(a) * rr))
        _env.sweep_tube(name, pts, 0.03, t, verts=8)


def controls(M):
    _env.sweep_tube("SeatPost", [(0, 0.18, 0.78), SEAT], 0.016, M["metal"], verts=8)
    lib.sphere("Saddle", 1.0, (0, 0.21, SEAT[2] + 0.04), M["seat"], scale=(0.1, 0.15, 0.05),
               u=16, v=8)
    lib.sphere("SaddleNose", 1.0, (0, 0.09, SEAT[2] + 0.035), M["seat"], scale=(0.045, 0.08, 0.04),
               u=12, v=6)
    _env.sweep_tube("Stem", [HEAD_HI, (0, -0.42, 0.98)], 0.018, M["metal"], verts=8)
    bar = [(-0.28, -0.32, 1.0), (-0.2, -0.38, 0.99), (-0.08, -0.42, 0.98), (0.08, -0.42, 0.98),
           (0.2, -0.38, 0.99), (0.28, -0.32, 1.0)]
    _env.sweep_tube("Handlebar", bar, 0.016, M["metal"], verts=8)
    for sgn in (-1, 1):
        _env.tube(f"Grip{sgn}", (sgn * 0.21, -0.37, 0.995), (sgn * 0.3, -0.31, 1.0), 0.024,
                  material=M["grip"], verts=10)
    # Cranks and pedals.
    lib.torus("Chainring", 0.08, 0.012, (0.05, BB[1], BB[2]), M["metal"], seg=20, ring=6,
              rot=(0, math.pi / 2, 0))
    for sgn in (-1, 1):
        end = (sgn * 0.09, BB[1] + sgn * 0.07, BB[2] - sgn * 0.12)
        _env.sweep_tube(f"Crank{sgn}", [(sgn * 0.06, BB[1], BB[2]), end], 0.014, M["metal"],
                        verts=6)
        lib.rbox(f"Pedal{sgn}", (0.1, 0.06, 0.025), (sgn * 0.14, end[1], end[2]), M["tyre"],
                 r=0.01, seg=1)
    # Kickstand to the ground on the left.
    _env.sweep_tube("Kickstand", [(0, 0.12, 0.3), (-0.12, 0.2, 0.01)], 0.012, M["metal"],
                    verts=6)


def basket(M):
    c = (0.0, -0.66, 0.9)
    _env.rr_ring("BasketWall", (0.36, 0.26, 0.06), (0.32, 0.22, 0.04), 0.2, c, M["wicker"],
                 seg=4, bevel=0.008, bseg=1, rot=(math.pi / 2, 0, 0))
    _env.rr_prism("BasketFloor", 0.34, 0.24, 0.02, 0.05, (c[0], c[1], c[2] - 0.095),
                  M["wicker"], seg=4, bevel=0.005, bseg=1)
    for z in (-0.04, 0.03):
        _env.rr_ring(f"BasketWeave{z}", (0.37, 0.27, 0.065), (0.355, 0.255, 0.058), 0.025,
                     (c[0], c[1], c[2] + z), M["frame"] if z > 0 else M["wicker"], seg=4,
                     bevel=0.004, bseg=1, rot=(math.pi / 2, 0, 0))
    _env.sweep_tube("BasketStay", [(0, c[1] + 0.1, c[2] - 0.1), (0, -0.5, 0.55)], 0.01,
                    M["metal"], verts=6)


def build():
    lib.begin(NAME)
    M = materials()
    wheel("Rear", REAR, M)
    wheel("Front", FRONT, M)
    frame(M)
    controls(M)
    basket(M)


META = dict(
    name="Bicycle",
    category="outdoor",
    priority="P1",
    description=("Chunky step-through city bike with mudguards, fat tyres, a cushy saddle and a "
                 "wicker basket"),
    tags=["bike", "vehicle", "street"],
    tintable=["Accent"],
    anchors={"saddle": [0, 0.9, -0.2], "basket": [0, 0.9, 0.66]},
    notes="Frame is 'Accent' (default teal #2EC4B6). Rides toward +Z; stands on its kickstand.",
)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META)
