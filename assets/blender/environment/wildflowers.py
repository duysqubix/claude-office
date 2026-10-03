"""Wildflowers: an instancing-friendly clump of little mixed flowers. A low faceted leafy mound
with eleven round-petalled flowers in pink, yellow, cream, coral and lilac rising out of it
on short stems, nodding outward. About 0.4 m across, 0.26 m tall. Origin at the ground centre; scatter
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
    _env.icoblob("Mound", 0.13, (0.0, 0.0, 0.025), leaf, scale=(1.2, 1.05, 0.7), subdiv=2,
                 lump=0.22, seed=5, flat=-0.15)
    for i in range(11):
        a = i * 2.39996 + rnd.uniform(-0.2, 0.2)
        d = 0.03 + 0.16 * math.sqrt((i + 0.5) / 12)
        h = 0.17 + rnd.uniform(0.0, 0.1) - 0.2 * d
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
