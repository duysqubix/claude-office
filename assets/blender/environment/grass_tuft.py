"""Grass tuft: a clump of a dozen chunky faceted blades fanning out, dark at the root and
light at the tips. About 0.35 m tall. Origin at the ground centre; scatter freely."""
import math

import lib
from environment import _env

NAME = "grass_tuft"
AO_RES = 256
AO_DISTANCE = 0.08


def materials():
    return [lib.mat("Grass", _env.P["grass"], rough=0.8),
            lib.mat("GrassDark", _env.P["grassDark"], rough=0.8),
            lib.mat("GrassLight", "#9BE15D", rough=0.8)]


def blades(M):
    rnd = _env.rng(3)
    for i in range(13):
        a = i * math.radians(137.5)
        off = 0.015 + 0.05 * rnd.random()
        lean = math.radians(62 + rnd.uniform(-10, 22) - (8 if i < 4 else 0))
        length = 0.22 + 0.14 * rnd.random() + (0.06 if i < 4 else 0)
        b = _env.blade(f"Blade{i}", (-math.sin(a) * off, math.cos(a) * off, -0.01), a, lean,
                       length, 0.05, 0.014, M[i % 3], droop=0.18, segs=4, base_w=0.7,
                       belly=0.25, roll=rnd.uniform(-0.4, 0.4))
        b.data.shade_flat()


def build():
    lib.begin(NAME)
    blades(materials())


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, strength=0.7)
