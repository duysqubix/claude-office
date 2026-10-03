"""Wildflowers: an instancing-friendly clump of little mixed flowers. A low faceted leafy mound
with nine round-petalled flowers in pink, yellow, cream, coral and lilac rising out of it
among leafy blades, nodding outward. About 0.5 m across, 0.4 m tall. Origin at the ground centre; scatter
freely with random yaw."""
import math

import lib
from environment import _env

NAME = "wildflowers"
AO_RES = 256
AO_DISTANCE = 0.06


def build():
    lib.begin(NAME)
    leaf = lib.mat("Leaf", _env.P["treeLeaf"][1], rough=0.8)
    stem = lib.mat("Stem", "#3FA45A", rough=0.7)
    petals = [_env.double_sided(lib.mat(f"Petal{i}", c, rough=0.6))
              for i, c in enumerate(_env.P["flowers"])]
    rnd = _env.rng(31)
    # A low leafy mound the flowers rise out of.
    _env.icoblob("Mound", 0.15, (0.0, 0.0, 0.03), leaf, scale=(1.2, 1.05, 0.72), subdiv=2,
                 lump=0.22, seed=5, flat=-0.15)
    # Leafy blades rising around the stems, so the flowers stand in foliage, not on sticks.
    for i in range(8):
        a = i * 0.785 + rnd.uniform(-0.2, 0.2)
        b = _env.blade(f"Leaf{i}", (0.06 * math.cos(a), 0.06 * math.sin(a), 0.02), a,
                       math.radians(70 + rnd.uniform(-6, 8)), 0.2 + rnd.uniform(0.0, 0.08), 0.05,
                       0.012, leaf, droop=0.25, segs=2, base_w=0.5, belly=0.3)
        b.data.shade_flat()
    for i in range(9):
        a = i * 2.39996 + rnd.uniform(-0.2, 0.2)
        d = 0.04 + 0.19 * math.sqrt((i + 0.5) / 9)
        h = 0.28 + rnd.uniform(0.0, 0.1) - 0.2 * d
        base = (0.5 * d * math.cos(a), 0.5 * d * math.sin(a), 0.06)
        top = (1.1 * d * math.cos(a), 1.1 * d * math.sin(a), h)
        _env.sweep_tube(f"Stem{i}", [base, top], 0.006, stem, verts=3, caps=False)
        _env.star_flower(f"Flower{i}", top, 0.036 + rnd.uniform(0.0, 0.012), petals[i % 5],
                         normal=(0.5 * math.cos(a), 0.5 * math.sin(a), 1.0),
                         spin=rnd.uniform(0, 6.3))


META = dict(
    name="Wildflowers", category="plant", priority="P1",
    description="Instancing-friendly clump of little mixed flowers rising out of a leafy mound",
    tags=["flowers", "garden", "lawn", "scatter", "faceted"], tintable=[], anchors={},
    notes="Petal materials are double-sided. About 400 tris: scatter in drifts along the trail.",
)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META, strength=0.7)
