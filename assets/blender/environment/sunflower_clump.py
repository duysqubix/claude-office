"""Sunflower clump: three sunflowers of different heights on stout stems with broad faceted
leaves, their big heads (a ring of sunny petals around a brown seed disc) turned toward the
front. Kept under 1.1 m so they never hide the manager. About 0.6 m across. Origin at the
ground centre; the faces look toward -Y (three.js +Z)."""
import math

from mathutils import Vector

import lib
from environment import _env

NAME = "sunflower_clump"
AO_RES = 256
AO_DISTANCE = 0.12

# (x, y, height, head radius, yaw of the face in degrees)
FLOWERS = [(-0.2, 0.02, 0.72, 0.15, -20), (0.17, -0.03, 0.86, 0.16, 14),
           (-0.02, 0.13, 0.94, 0.14, 2)]


def build():
    lib.begin(NAME)
    stem = lib.mat("Stem", "#4E9A45", rough=0.7)
    leaf = lib.mat("Leaf", "#46B35A", rough=0.75)
    petal = _env.double_sided(lib.mat("Petal", "#FFC93C", rough=0.6))
    seed = lib.mat("Seeds", "#7A4A2A", rough=0.85)
    for i, (x, y, h, r, yaw) in enumerate(FLOWERS):
        face = Vector((math.sin(math.radians(yaw)), -1.0, 0.35)).normalized()
        head = Vector((x, y, h))
        _env.sweep_tube(f"Stem{i}", [(x, y, -0.01), (x + 0.02, y, h * 0.55),
                                     tuple(head - face * 0.03)], 0.022, stem, verts=5,
                        caps=False)
        for k, (z, a) in enumerate(((0.36, 0.8), (0.55, 3.6))):
            b = _env.blade(f"Leaf{i}_{k}", (x, y, h * z), a + i, math.radians(18), 0.2, 0.13,
                           0.016, leaf, droop=0.45, segs=3, base_w=0.25, belly=0.45, tip=0.0)
            b.data.shade_flat()
        _env.star_flower(f"Petals{i}", tuple(head), r, petal, petals=12, normal=tuple(face),
                         spin=0.13 * i)
        disc = lib.lathe(f"Disc{i}", [(0.0, 0.0), (r * 0.5, 0.0), (r * 0.48, 0.015),
                                      (r * 0.3, 0.03), (0.0, 0.034)], material=seed, verts=12)
        disc.location = tuple(head + face * 0.004)
        disc.rotation_euler = face.to_track_quat("Z", "Y").to_euler()
    for k in range(2):
        b = _env.blade(f"BaseLeaf{k}", (0.0, 0.0, 0.0), 1.2 + k * 2.6, math.radians(30), 0.24,
                       0.11, 0.016, leaf, droop=0.5, segs=3, base_w=0.3, belly=0.45)
        b.data.shade_flat()


META = dict(
    name="Sunflower clump", category="plant", priority="P1",
    description="Three cheerful sunflowers of different heights with broad leaves, faces forward",
    tags=["flowers", "garden", "sunflower", "faceted"], tintable=[], anchors={},
    notes="Petals are double-sided. Under 1.1 m tall; the faces look toward +Z.",
)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META, strength=0.7)
