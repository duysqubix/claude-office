"""Blossom tree: a cherry tree in full pink bloom. A stout trunk forking into limbs, a wide
umbrella canopy of faceted low-poly puffs in three pinks, and fallen petals
scattered on the grass around it. About 3.8 m tall. Origin at the trunk foot."""
import math

import lib
from environment import _env

NAME = "tree_blossom"
AO_RES = 512
AO_DISTANCE = 0.5
FACETED = True

# (x, y, z, radius, material, cuts). Materials: 0 Blossom, 1 BlossomDeep, 2 BlossomLight.
# A wide umbrella: a ring of low puffs, a flatter crown, a few small puffs on top.
PUFFS = [(0.0, 0.0, 2.6, 1.05, 0, 7)]
for _i in range(8):
    _a = math.radians(10 + _i * 45)
    PUFFS.append((1.15 * math.cos(_a), 1.1 * math.sin(_a), 2.3 + 0.1 * (_i % 3), 0.66,
                  1 if _i % 2 else 0, 7))
for _i in range(4):
    _a = math.radians(-60 + _i * 90)
    PUFFS.append((0.6 * math.cos(_a), 0.6 * math.sin(_a), 3.0 + 0.06 * (_i % 2), 0.55, 2, 6))
PUFFS.append((0.05, 0.0, 3.35, 0.45, 2, 6))


def materials():
    return dict(
        trunk=lib.mat("Trunk", "#8A5A3C", rough=0.85),
        # Warm, saturated pinks: paler ones turn lilac under the blue sky light.
        blossom=[lib.mat("Blossom", "#FFA3CD", rough=0.8),
                 lib.mat("BlossomDeep", "#FF86BF", rough=0.8),
                 lib.mat("BlossomLight", "#FFBAD9", rough=0.8)],
    )


def trunk(M):
    # A stout trunk that forks at 1.2 m into two leaning limbs, plus a third smaller one.
    prof = [(0.0, 0.0), (0.36, 0.0), (0.35, 0.03), (0.3, 0.1), (0.26, 0.25), (0.24, 0.6),
            (0.22, 1.0), (0.2, 1.35), (0.0, 1.4)]
    _env.trunk("Trunk", prof, M["trunk"], verts=12, bend=(-0.08, 0.05), seed=4, wobble=0.04,
               roots=5, root_amp=0.3, root_h=0.45)
    for k, (start, tip, r0, r1) in enumerate((
            ((-0.05, 0.03, 1.2), (-0.75, 0.25, 2.35), 0.16, 0.09),
            ((-0.05, 0.03, 1.2), (0.6, -0.3, 2.4), 0.15, 0.085),
            ((-0.06, 0.04, 1.0), (0.3, 0.75, 2.2), 0.1, 0.06))):
        _env.tube(f"Limb{k}", start, tip, r0, r1, M["trunk"], verts=10)


def canopy(M):
    _env.puff_cluster("Puff", PUFFS, M["blossom"], seed=80, ground=-10, scale=(1, 1, 0.88),
                      faceted=FACETED)


def petals(M):
    rnd = _env.rng(17)
    for i in range(14):
        a = rnd.uniform(0, 2 * math.pi)
        d = rnd.uniform(0.55, 1.5)
        _env.icoblob(f"Petal{i}", 0.1, (math.cos(a) * d, math.sin(a) * d, 0.008),
                     M["blossom"][i % 3], scale=(1, 0.7, 0.12), subdiv=1, lump=0.15, seed=i,
                     rot=(0, 0, rnd.uniform(0, 3)))


def build():
    lib.begin(NAME)
    M = materials()
    trunk(M)
    canopy(M)
    petals(M)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, strength=0.8)
