"""Flag pole: a tall cream pole with a gold ball finial on a round stone plinth, a halyard
rope down to a cleat, and a waving Claude-orange flag with a cream sparkle on its own node
`Flag`, pivoting on the pole so the game can flutter it. 5 m tall. Origin at the ground
centre; the flag flies toward +X and reads from -Y."""
import math

import bmesh

import lib
from environment import _env

NAME = "flag_pole"
AO_RES = 512
AO_DISTANCE = 0.2

POLE_TOP = 5.0
FLAG_W, FLAG_H = 1.4, 0.9
FLAG_TOP = 4.85
HOIST = (0.0, 0.0, FLAG_TOP - FLAG_H / 2)
SPARKLE = (0.05 + FLAG_W * 0.42, FLAG_TOP - FLAG_H / 2)  # centre (x, z)


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


def sparkle_arm(k):
    """Arm k of the 10-arm sparkle (long and short in turn, widest a quarter of the way out)
    as its two edges in flag (x, z), hub to tip: right faces arm k-1, left faces arm k+1."""
    cx, cz = SPARKLE
    a = math.radians(k * 36 + 8)
    length = 0.27 if k % 2 == 0 else 0.19
    w = 0.045
    edges = {-1: [], 1: []}
    for s in range(5):
        f = length * s / 4
        half = w * (1 - 0.5 * s / 4) * (0.7 if s == 0 else 1.0)
        for e in (-1, 1):
            edges[e].append((cx + math.sin(a) * f + math.cos(a) * half * e,
                             cz + math.cos(a) * f - math.sin(a) * half * e))
    return edges[-1], edges[1]


def notch(left, right):
    """Where one arm's left edge crosses the next arm's right edge: (s along the left edge,
    s along the right edge, point)."""
    for i in range(4):
        for j in range(4):
            (px, pz), (qx, qz) = left[i], left[i + 1]
            (ax, az), (bx, bz) = right[j], right[j + 1]
            den = (qx - px) * (bz - az) - (qz - pz) * (bx - ax)
            if abs(den) < 1e-12:
                continue
            t = ((ax - px) * (bz - az) - (az - pz) * (bx - ax)) / den
            u = ((ax - px) * (qz - pz) - (az - pz) * (qx - px)) / den
            if 0 <= t <= 1 and 0 <= u <= 1:
                return i + t, j + u, (px + t * (qx - px), pz + t * (qz - pz))
    raise ValueError("sparkle arms don't meet")


def sparkle_tris():
    """The sparkle as one outline with nothing overlapping: a hub through the notches between
    neighbouring arms, plus each arm's tail beyond them. (Ten whole arms overlapping flush at
    the hub fought for depth there.) Triangles in flag (x, z), counter-clockwise."""
    arms = [sparkle_arm(k) for k in range(10)]
    notches = [notch(arms[k][1], arms[(k + 1) % 10][0]) for k in range(10)]
    c = SPARKLE

    def half_way(p):
        return ((c[0] + p[0]) / 2, (c[1] + p[1]) / 2)

    tris = []
    for k, (right, left) in enumerate(arms):
        _, s_a, a = notches[k - 1]  # on this arm's right edge
        s_b, _, b = notches[k]  # on its left edge
        tris += [(c, half_way(a), half_way(b)), (half_way(a), a, b), (half_way(a), b, half_way(b))]
        # The tail: zip its two edges from the notches out to the tip.
        rs = [(s_a, a)] + [(s, right[s]) for s in range(5) if s > s_a]
        ls = [(s_b, b)] + [(s, left[s]) for s in range(5) if s > s_b]
        i = j = 0
        while i < len(rs) - 1 or j < len(ls) - 1:
            if j == len(ls) - 1 or (i < len(rs) - 1 and rs[i + 1][0] <= ls[j + 1][0]):
                tris.append((rs[i][1], rs[i + 1][1], ls[j][1]))
                i += 1
            else:
                tris.append((rs[i][1], ls[j + 1][1], ls[j][1]))
                j += 1
    ccw = []
    for p, q, r in tris:
        turn = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
        ccw.append((p, q, r) if turn > 0 else (p, r, q))
    return ccw


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
    # Sparkle on both faces, following the ripple. Counter-clockwise in (x, z) faces -Y.
    tris = sparkle_tris()
    for side in (-1, 1):
        bm = bmesh.new()
        verts = {}
        for tri in tris:
            for x, z in tri:
                key = (round(x, 6), round(z, 6))
                if key not in verts:
                    verts[key] = bm.verts.new((x, wave(x, z) + side * 0.004, z))
            f = [verts[round(x, 6), round(z, 6)] for x, z in tri]
            bm.faces.new(f if side < 0 else f[::-1])
        lib._link(f"Flag_Mark{side}", bm, M["mark"])
    for o in lib.coll().objects:
        if o.name.startswith("Flag_"):
            lib.node(o, "Flag", pivot=HOIST)


def build():
    lib.begin(NAME)
    M = materials()
    pole(M)
    cloth(M)


META = dict(
    name="Flag pole",
    category="outdoor",
    priority="P1",
    description=("5 m cream flag pole on a stone plinth flying a waving Claude-orange flag with a "
                 "cream sparkle"),
    tags=["flag", "garden", "landmark", "animated"],
    tintable=[],
    anchors={"top": [0, 5.07, 0]},
    nodes={
        "Flag": ("waving cloth; pivot on the pole axis at y 4.4; flutter by rotating about Y "
                 "(three.js) a few degrees, or scale X slightly"),
    },
    notes="Flag materials are double-sided.",
)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META)
