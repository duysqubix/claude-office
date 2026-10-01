"""Plant pot: chunky terracotta pot with a fat rolled rim and a bushy pilea-like plant of
soft pebble leaves on short stems. Pot is 0.35 m tall; origin at the floor centre."""
import math

from mathutils import Vector

import lib

NAME = "plant_pot"
AO_RES = 512
META = dict(
    name="Potted plant", category="plant", priority="P0",
    description="Chunky terracotta pot with a bushy pilea of soft round leaves",
    tags=["plant", "decor", "floor"], tintable=[],
    anchors_bl={},
)

# (tilt from vertical in degrees, stem length, leaf scale), phyllotaxis by the golden angle.
LEAVES = [
    (6, 0.30, 1.0), (22, 0.26, 1.0), (30, 0.22, 1.05), (38, 0.24, 1.0), (46, 0.18, 1.0),
    (52, 0.16, 0.95), (18, 0.30, 0.9), (60, 0.12, 0.9), (40, 0.20, 1.0), (28, 0.14, 0.85),
    (55, 0.20, 1.0), (12, 0.22, 0.9),
]


def materials():
    return dict(
        pot=lib.mat("Pot", lib.P["plantPot"], rough=0.8),
        rim=lib.mat("PotRim", "#EE9466", rough=0.75),
        soil=lib.mat("Soil", "#6B4A32", rough=0.95),
        stem=lib.mat("Stem", "#3FA45A", rough=0.7),
        leaves=[lib.mat("Leaf", lib.P["plantLeaf"], rough=0.6),
                lib.mat("LeafLight", lib.P["treeLeaf"][2], rough=0.6),
                lib.mat("LeafDark", lib.P["treeLeaf"][1], rough=0.6)],
    )


def pot(M):
    body = [(0, 0), (0.135, 0), (0.15, 0.006), (0.158, 0.02), (0.18, 0.27), (0.18, 0.28),
            (0.0, 0.28)]
    lib.lathe("Pot_Body", body, material=M["pot"], verts=32)
    rim = [(0.17, 0.26), (0.2, 0.262), (0.214, 0.275), (0.22, 0.3), (0.216, 0.33),
           (0.205, 0.345), (0.19, 0.35), (0.175, 0.345), (0.168, 0.33), (0.168, 0.26)]
    lib.lathe("Pot_Rim", rim + [rim[0]], material=M["rim"], verts=32)
    lib.cyl("Pot_Soil", 0.17, 0.02, (0, 0, 0.315), M["soil"], r=0.008, seg=1, verts=32)


def foliage(M):
    base = Vector((0, 0, 0.32))
    golden = math.radians(137.5)
    for i, (tilt, length, s) in enumerate(LEAVES):
        yaw = i * golden
        t = math.radians(tilt)
        d = Vector((math.sin(t) * math.cos(yaw), math.sin(t) * math.sin(yaw), math.cos(t)))
        tip = base + d * length
        lib.cyl(f"Stem{i}", 0.014, length + 0.02, tuple(base + d * (length / 2)), M["stem"],
                r=0, verts=8, rot=d.to_track_quat("Z", "Y").to_euler())
        # The leaf droops further out than its stem.
        t2 = math.radians(min(tilt * 1.3 + 30, 95))
        d2 = Vector((math.sin(t2) * math.cos(yaw), math.sin(t2) * math.sin(yaw),
                     math.cos(t2)))
        lib.sphere(f"Leaf{i}", 1.0, tuple(tip + d2 * (0.11 * s)), M["leaves"][i % 3],
                   scale=(0.075 * s, 0.115 * s, 0.022), u=20, v=8,
                   rot=d2.to_track_quat("Y", "Z").to_euler())


STEPS = [pot, foliage]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
