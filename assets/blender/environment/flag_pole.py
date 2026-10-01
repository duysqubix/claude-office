"""Flag pole: a tall cream pole with a gold ball finial on a round stone plinth, a halyard
rope down to a cleat, and a waving Claude-orange flag with a cream sparkle on its own node
`Flag`, pivoting on the pole so the game can flutter it. 5 m tall. Origin at the ground
centre; the flag flies toward +X and reads from -Y."""
import math

import bmesh
from mathutils import Vector

import lib
from environment import _env

NAME = "flag_pole"
AO_RES = 512
AO_DISTANCE = 0.2

POLE_TOP = 5.0
FLAG_W, FLAG_H = 1.4, 0.9
FLAG_TOP = 4.85
HOIST = (0.0, 0.0, FLAG_TOP - FLAG_H / 2)
NODES = {"Flag": HOIST}


def materials():
    flag = lib.mat("FlagCloth", _env.P["claude"], rough=0.7)
    flag.use_backface_culling = False  # a cloth: visible from both sides
    mark = lib.mat("FlagMark", "#FFF4E3", rough=0.7)
    mark.use_backface_culling = False
    return dict(
        pole=lib.mat("Pole", "#F4EFE6", rough=0.45),
        gold=lib.mat("Gold", "#FFC93C", rough=0.4),
        stone=lib.mat("Stone", "#D9D2C5", rough=0.85),
        rope=lib.mat("Rope", "#EDE3D0", rough=0.9),
        flag=flag,
        mark=mark,
    )


def wave(x, z):
    """Cloth ripple: zero at the hoist, growing toward the fly end."""
    t = x / FLAG_W
    return 0.09 * t * math.sin(2 * math.pi * (1.3 * t) + 1.2 * (z - HOIST[2]))


def pole(M):
    base = [(0.0, 0.0), (0.32, 0.0), (0.33, 0.03), (0.31, 0.12), (0.22, 0.16), (0.2, 0.22),
            (0.0, 0.22)]
    lib.lathe("Plinth", base, material=M["stone"], verts=32)
    _env.tube("Pole", (0, 0, 0.18), (0, 0, POLE_TOP), 0.055, 0.035, M["pole"], verts=14,
              round_ends=False)
    lib.torus("Collar", 0.06, 0.018, (0, 0, 0.26), M["gold"], seg=20, ring=6)
    lib.sphere("Finial", 0.08, (0, 0, POLE_TOP + 0.07), M["gold"], u=16, v=10)
    # Halyard down the side of the pole to a cleat.
    _env.sweep_tube("Rope", [(0.06, -0.01, POLE_TOP - 0.05), (0.07, -0.02, 2.5),
                             (0.065, -0.02, 1.25)], 0.006, M["rope"], verts=5)
    lib.rbox("Cleat", (0.04, 0.03, 0.14), (0.06, -0.02, 1.2), M["gold"], r=0.012, seg=2)


def cloth(M):
    nx, nz = 20, 12
    bm = bmesh.new()
    grid = []
    for j in range(nz + 1):
        z = FLAG_TOP - FLAG_H + FLAG_H * j / nz
        row = []
        for i in range(nx + 1):
            x = 0.05 + (FLAG_W - 0.05) * i / nx
            row.append(bm.verts.new((x, wave(x, z), z)))
        grid.append(row)
    for j in range(nz):
        for i in range(nx):
            bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
    lib._link("Flag_Cloth", bm, M["flag"])
    # Sparkle on both faces, following the ripple.
    cx, cz = 0.05 + FLAG_W * 0.42, FLAG_TOP - FLAG_H / 2
    for side in (-1, 1):
        bm = bmesh.new()
        for k in range(10):
            a = math.radians(k * 36 + 8)
            length = 0.27 if k % 2 == 0 else 0.19
            w = 0.045
            strip = []
            for s in range(5):
                f = length * s / 4
                half = w * (1 - 0.5 * s / 4) * (0.7 if s == 0 else 1.0)
                for e in (-1, 1):
                    x = cx + math.sin(a) * f + math.cos(a) * half * e
                    z = cz + math.cos(a) * f - math.sin(a) * half * e
                    strip.append(bm.verts.new((x, wave(x, z) + side * 0.004, z)))
            for s in range(4):
                q = (strip[2 * s], strip[2 * s + 1], strip[2 * s + 3], strip[2 * s + 2])
                bm.faces.new(q if side < 0 else q[::-1])
        lib._link(f"Flag_Mark{side}", bm, M["mark"])


def build():
    lib.begin(NAME)
    M = materials()
    pole(M)
    cloth(M)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, nodes=NODES, node_res=256)
