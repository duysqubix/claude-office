"""Rose arch: a painted wooden garden arch to walk through where the trail leaves the main
path. Two pairs of posts with side rails, two curved beams over the top tied by slats, and
climbing roses: faceted leafy clumps up both sides and over the crown, dotted with red, pink
and coral blooms. 1.4 m clear between the posts, 2 m clear under the beams, about 2.8 m tall.
Origin at the ground centre of the walk-through, which runs along Y (three.js Z)."""
import math

from mathutils import Vector

import lib
from environment import _env

NAME = "rose_arch"
AO_RES = 512
AO_DISTANCE = 0.25

HALF = 0.75          # post centres at x = ±HALF
DEPTH = 0.22         # front / back post pairs at y = ±DEPTH
SPRING = 2.05        # where the arch beams leave the posts
RISE = 0.5


def arch_z(x):
    return SPRING + RISE * math.sqrt(max(0.0, 1 - (x / HALF) ** 2))


# Leafy clumps: (x, y, z, radius, material). Materials: 0 Leaf, 1 LeafDark.
CLUMPS = ([(s * HALF, 0.0, z, 0.25, 1) for s in (1, -1) for z in (0.55, 1.12, 1.7)] +
          [(x, 0.0, arch_z(x) + 0.04, 0.22, 0) for x in (-0.48, 0.0, 0.48)])


def build():
    lib.begin(NAME)
    paint = lib.mat("Paint", "#FBF4E6", rough=0.6)
    leaves = [lib.mat("Leaf", _env.P["treeLeaf"][1], rough=0.8),
              lib.mat("LeafDark", "#3A9A50", rough=0.8)]
    roses = [lib.mat(f"Rose{i}", c, rough=0.6) for i, c in
             enumerate(("#E63946", "#FF7EB6", "#FF7A6B"))]
    for sx in (-1, 1):
        for sy in (-1, 1):
            lib.rbox(f"Post{sx}{sy}", (0.09, 0.09, SPRING + 0.04), (sx * HALF, sy * DEPTH,
                     (SPRING + 0.04) / 2), paint, r=0.02, seg=1)
        for z in (0.7, 1.4):
            lib.rbox(f"Rail{sx}{z}", (0.045, 2 * DEPTH, 0.045), (sx * HALF, 0.0, z), paint,
                     r=0.012, seg=1)
    for sy in (-1, 1):
        pts = [(x, sy * DEPTH, arch_z(x)) for x in
               (HALF * math.cos(math.pi * k / 12) for k in range(13))]
        _env.sweep_tube(f"Beam{sy}", pts, 0.045, paint, verts=6)
    for x in (-0.6, -0.3, 0.0, 0.3, 0.6):
        lib.rbox(f"Slat{x}", (0.05, 2 * DEPTH + 0.12, 0.035), (x, 0.0, arch_z(x) + 0.03), paint,
                 r=0.01, seg=1)
    _env.puff_cluster("Clump", CLUMPS, leaves, seed=150, ground=-1)
    rnd = _env.rng(9)
    k = 0
    for x, y, z, r, _ in CLUMPS:
        for j in range(2):
            a = rnd.uniform(0, 2 * math.pi)
            d = Vector((math.cos(a), math.sin(a) * 0.9 + (0.8 if j else -0.8), 0.3)).normalized()
            at = Vector((x, y, z)) + d * (r * 0.95)
            _env.icoblob(f"Rose{k}", 0.065, tuple(at), roses[k % 3], scale=(1, 1, 0.85),
                         subdiv=1, lump=0.1, seed=k + 80)
            k += 1


META = dict(
    name="Rose arch", category="outdoor", priority="P1",
    description="Painted wooden garden arch with climbing roses, to walk through on the trail",
    tags=["garden", "trail", "arch", "roses", "flowers"], tintable=[],
    anchors={"pass": [0.0, 0.0, 0.0]},
    notes=("Walk through it along Z: 1.4 m clear between the posts, about 2 m clear under the "
           "beams. Collide with the four posts only."),
)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META, strength=0.8)
