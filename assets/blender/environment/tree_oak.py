"""Oak: a big shade tree for the back of the garden. A stout trunk swelling into soft buttress
roots forks into four spreading limbs that hold a wide, flat umbrella of a canopy of faceted
low-poly puffs in deep greens, lighter on top. The canopy's underside sits about 2.6 m up, so
people walk and sit under it. About 5 m tall, 6 m across. Origin at the trunk foot."""
import math

import lib
from environment import _env

NAME = "tree_oak"
AO_RES = 512
AO_DISTANCE = 0.7

# (x, y, z, radius, material). Materials: 0 Leaf, 1 LeafDark, 2 LeafLight.
# A wide, flat umbrella: an outer ring of big puffs, an inner ring riding higher, a crown.
PUFFS = [(0.0, 0.0, 3.95, 1.3, 0)]
for _i in range(8):
    _a = math.radians(10 + _i * 45)
    PUFFS.append((2.05 * math.cos(_a), 1.95 * math.sin(_a), 3.35 + 0.12 * (_i % 2), 0.98,
                  1 if _i % 2 else 0))
for _i in range(5):
    _a = math.radians(35 + _i * 72)
    PUFFS.append((1.05 * math.cos(_a), 1.05 * math.sin(_a), 4.25, 0.85, 2))
LIMBS = [((0.05, 0.0, 2.0), (1.5, 0.45, 3.15)), ((0.0, 0.05, 2.15), (-1.15, 1.15, 3.2)),
         ((-0.02, -0.02, 2.25), (-0.5, -1.5, 3.15)), ((0.02, 0.0, 2.4), (0.6, -0.9, 3.5))]


def materials():
    return dict(
        trunk=lib.mat("Trunk", _env.P["treeTrunk"], rough=0.85),
        leaves=[lib.mat("Leaf", "#46B35A", rough=0.8),
                lib.mat("LeafDark", "#3A9A50", rough=0.8),
                lib.mat("LeafLight", "#5CCB5F", rough=0.8)],
    )


def build():
    lib.begin(NAME)
    M = materials()
    prof = [(0.0, 0.0), (0.56, 0.0), (0.53, 0.05), (0.45, 0.16), (0.4, 0.36), (0.37, 0.9),
            (0.35, 1.5), (0.32, 2.0), (0.26, 2.7), (0.0, 2.8)]
    _env.trunk("Trunk", prof, M["trunk"], verts=16, bend=(0.06, -0.04), seed=8, lumps=0.04,
               roots=5, root_amp=0.38, root_h=0.55)
    for k, (a, b) in enumerate(LIMBS):
        _env.tube(f"Limb{k}", a, b, 0.2, 0.1, M["trunk"], verts=10)
    _env.puff_cluster("Puff", PUFFS, M["leaves"], seed=130, ground=-10, scale=(1, 1, 0.72))


META = dict(
    name="Oak", category="outdoor", priority="P1",
    description=("Big faceted shade tree: a stout forked trunk under a wide umbrella canopy you "
                 "can walk under"),
    tags=["tree", "garden", "lawn", "shade", "foliage", "faceted"], tintable=[],
    anchors={"canopy": [0.0, 3.7, 0.0]},
    notes="Canopy underside about 2.6 m up. Fade it like the other trees when it hides the manager.",
)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META, strength=0.8)
