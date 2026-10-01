"""Pine tree: four stacked faceted cones with zig-zag scalloped hems, darkest at the bottom and
lightest at the tip (PALETTE.treeLeaf), on a short chunky trunk with buttress roots.
About 3.8 m tall, 2.8 m across. Origin at the trunk foot."""
import lib
from environment import _env

NAME = "tree_pine"
AO_RES = 512
AO_DISTANCE = 0.45

# Tiers bottom → top: (radius, height, base z, material, scallops, phase).
TIERS = [
    (1.30, 1.40, 0.88, 1, 9, 0.0),
    (1.04, 1.25, 1.6, 0, 8, 0.4),
    (0.80, 1.12, 2.26, 0, 7, 0.9),
    (0.58, 0.9, 2.86, 2, 6, 0.2),
]


def materials():
    return dict(
        trunk=lib.mat("Trunk", _env.P["treeTrunk"], rough=0.85),
        leaves=[lib.mat("Leaf", _env.P["treeLeaf"][0], rough=0.8),
                lib.mat("LeafDark", _env.P["treeLeaf"][1], rough=0.8),
                lib.mat("LeafLight", _env.P["treeLeaf"][2], rough=0.8)],
    )


def trunk(M):
    prof = [(0.0, 0.0), (0.3, 0.0), (0.295, 0.025), (0.27, 0.07), (0.24, 0.15), (0.215, 0.3),
            (0.2, 0.6), (0.18, 1.3), (0.0, 1.3)]
    _env.trunk("Trunk", prof, M["trunk"], verts=12, seed=3, wobble=0.03, roots=5,
               root_amp=0.32, root_h=0.4)


def tiers(M):
    for i, (r, h, z0, k, n, ph) in enumerate(TIERS):
        top = i == len(TIERS) - 1
        # Low-poly: one vertex per scallop crest and trough.
        _env.skirt(f"Tier{i}", r, h, z0, M["leaves"][k], verts=2 * n, scallops=n, amp=0.09,
                   droop=0.08, phase=ph, tip=0.3 if top else 0.22)


STEPS = [trunk, tiers]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


META = dict(
    name="Pine tree",
    category="outdoor",
    priority="P0",
    description="Four stacked faceted cones with zig-zag scalloped hems on a stubby trunk",
    tags=["tree", "pine", "garden", "lawn", "foliage", "faceted"],
    tintable=[],
    anchors={"top": [0, 3.76, 0]},
    notes="About 1.2k tris.",
)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META, strength=0.85)
