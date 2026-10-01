"""Hanging pothos on a wall bracket: a curly iron bracket holds a round `Accent` ceramic
bowl on three jute ropes; heart-leaf vines tumble over the rim. No ceiling in the office, so
it mounts on a wall. Origin at the wall-contact centre of the bracket plate (the wall is the
+Y side, the plant hangs out toward -Y); mount it ~2 m up. About 1.2 m tall in total."""
import math

import lib
from environment import _env

NAME = "plant_hanging"
AO_RES = 512
AO_DISTANCE = 0.15

ARM = 0.38            # bracket reach from the wall
POT_C = (0.0, -ARM, -0.62)   # bowl rim centre (the hook is at the end of the arm)
POT_R = 0.17


def materials():
    return dict(
        iron=lib.mat("Iron", _env.P["doorFrame"], rough=0.5),
        rope=lib.mat("Rope", "#D9B77E", rough=0.9),
        pot=lib.mat("Accent", lib.P["deskAccents"][2], rough=0.45),
        soil=lib.mat("Soil", "#6B4A32", rough=0.95),
        leaves=[lib.mat("Leaf", "#4CC46A", rough=0.5),
                lib.mat("LeafDark", "#37A456", rough=0.5),
                lib.mat("LeafVariegated", "#A5E07C", rough=0.5)],
        stem=lib.mat("Vine", "#3FA45A", rough=0.6),
    )


def bracket(M):
    lib.rbox("Plate", (0.09, 0.03, 0.2), (0, -0.015, -0.02), M["iron"], r=0.012, seg=2)
    _env.sweep_tube("Arm", [(0, -0.02, 0.04), (0, -ARM * 0.5, 0.045), (0, -ARM, 0.04),
                            (0, -ARM - 0.03, 0.02)], 0.016, M["iron"], verts=10)
    # Decorative scroll brace under the arm.
    scroll = [(0, -0.02, -0.1)]
    for k in range(12):
        t = k / 11
        ang = math.pi * 1.6 * t
        rr = 0.09 * (1 - 0.55 * t)
        scroll.append((0, -0.03 - 0.16 * t - rr * math.sin(ang) * 0.4,
                       -0.08 + 0.1 * t + rr * (1 - math.cos(ang)) * 0.35))
    _env.sweep_tube("Scroll", scroll, 0.011, M["iron"], verts=8)
    lib.torus("Hook", 0.028, 0.008, (0, -ARM, -0.0), M["iron"], seg=16, ring=6,
              rot=(0, math.pi / 2, 0))


def bowl(M):
    cx, cy, cz = POT_C
    prof = [(0.0, -0.17), (0.07, -0.165), (0.13, -0.13), (0.165, -0.06), (POT_R, 0.0),
            (POT_R + 0.012, 0.012), (POT_R, 0.024), (POT_R - 0.015, 0.012), (0.0, 0.012)]
    lib.lathe("Bowl", prof, loc=POT_C, material=M["pot"], verts=32)
    lib.cyl("Soil", POT_R - 0.02, 0.02, (cx, cy, cz + 0.004), M["soil"], r=0.005, seg=1,
            verts=28)
    for k in range(3):
        a = math.radians(90 + k * 120)
        rim = (cx + math.cos(a) * POT_R, cy + math.sin(a) * POT_R, cz + 0.02)
        _env.sweep_tube(f"Rope{k}", [(0, -ARM, -0.03), rim], 0.006, M["rope"], verts=6)


def leaf(name, at, yaw, pitch, size, mat):
    """Pothos heart: wide shoulders, a pointed tip, a notch at the stem."""
    _env.fan_leaf(name, at, yaw, pitch, size, mat, thick=0.014, droop=0.12, samples=16,
                  rings=1, back=0.38, pointy=1.8, cup=0.15)


def foliage(M):
    cx, cy, cz = POT_C
    rnd = _env.rng(5)
    # A mound of leaves on top of the bowl.
    for i in range(12):
        a = i * math.radians(137.5)
        rr = 0.04 + 0.1 * (i % 4) / 3
        at = (cx + math.cos(a) * rr, cy + math.sin(a) * rr, cz + 0.03 + 0.03 * (i % 2))
        leaf(f"Top{i}", at, a - math.pi / 2, math.radians(25 + 10 * (i % 3)),
             0.11 + 0.015 * (i % 3), M["leaves"][i % 3])
    # Trailing vines over the rim, mostly toward the front and sides.
    for v, deg in enumerate((200, 250, 290, 330, 20, 75, 150)):
        a = math.radians(deg)
        start = Vector3(cx + math.cos(a) * (POT_R - 0.01), cy + math.sin(a) * (POT_R - 0.01), cz + 0.01)
        drop = 0.32 + 0.22 * ((v * 3) % 4) / 3
        pts = []
        for k in range(7):
            t = k / 6
            out = 0.05 + 0.05 * math.sin(t * math.pi)
            pts.append((start[0] + math.cos(a) * out + 0.03 * math.sin(3 * t + v),
                        start[1] + math.sin(a) * out,
                        start[2] - drop * t * t * 0.9 - 0.02 * t))
        _env.sweep_tube(f"Vine{v}", pts, 0.006, M["stem"], verts=5, r_end=0.004)
        for k in range(1, 7):
            px, py, pz = pts[k]
            side = 1 if k % 2 else -1
            leaf(f"Vine{v}Leaf{k}", (px, py, pz), a - math.pi / 2 + side * 1.1 + rnd.uniform(-0.3, 0.3),
                 math.radians(-50 + rnd.uniform(-15, 15)), 0.1 - 0.005 * k,
                 M["leaves"][(v + k) % 3])


def Vector3(x, y, z):
    return (x, y, z)


def build():
    lib.begin(NAME)
    M = materials()
    bracket(M)
    bowl(M)
    foliage(M)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, bake_lift=50, preview_lift=1.25)
