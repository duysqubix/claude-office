"""Tall grass: an ornamental grass clump. Fifteen long faceted blades arch out of a tight base,
dark at the root and light at the tips, with three feathery wheat-coloured seed plumes on
stalks standing above them. About 0.78 m tall to the plumes, 0.65 m across. Origin at the ground centre;
scatter freely with random yaw."""
import math

import lib
from environment import _env

NAME = "tall_grass"
AO_RES = 256
AO_DISTANCE = 0.1


def build():
    lib.begin(NAME)
    greens = [lib.mat("Grass", _env.P["grass"], rough=0.8),
              lib.mat("GrassDark", _env.P["grassDark"], rough=0.8),
              lib.mat("GrassLight", "#9BE15D", rough=0.8)]
    stalk = lib.mat("Stalk", "#B9A86A", rough=0.8)
    plume = lib.mat("Plume", "#EAD9A2", rough=0.85)
    rnd = _env.rng(8)
    for i in range(14):
        a = i * 2.39996
        off = 0.015 + 0.04 * rnd.random()
        length = 0.48 + 0.2 * rnd.random()
        b = _env.blade(f"Blade{i}", (off * math.cos(a), off * math.sin(a), -0.01), a,
                       math.radians(78 + rnd.uniform(-7, 8)), length, 0.075, 0.016,
                       greens[(1, 0, 2)[i % 3]], droop=0.2 + 0.1 * rnd.random(), segs=3,
                       base_w=0.55, belly=0.22, roll=rnd.uniform(-0.4, 0.4))
        b.data.shade_flat()
    for k in range(3):
        a = k * 2.1 + 0.4
        top = (0.06 * math.cos(a), 0.06 * math.sin(a), 0.5 + 0.04 * k)
        _env.sweep_tube(f"Stalk{k}", [(0.0, 0.0, 0.0), (top[0] * 0.5, top[1] * 0.5, 0.5), top],
                        0.006, stalk, verts=3, caps=False)
        _env.icoblob(f"Plume{k}", 0.065, (top[0] * 1.08, top[1] * 1.08, top[2] + 0.09), plume,
                     scale=(0.62, 0.62, 1.9), subdiv=1, lump=0.12, seed=k + 3)


META = dict(
    name="Tall grass", category="plant", priority="P1",
    description="Ornamental grass clump: long arching faceted blades with three feathery plumes",
    tags=["grass", "garden", "lawn", "scatter", "faceted"], tintable=[], anchors={},
    notes="About 450 tris; tall enough to fade like a wall when it stands between camera and manager.",
)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META, strength=0.7)
