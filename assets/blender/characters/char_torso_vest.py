"""Torso, vest: a smart `Accent` sweater-vest with a deep V-neck over a collared `Shirt`,
rolled edges, three buttons below the V and a soft hem at the belt. Pivot at the pelvis
joint; the upper body is node `Chest` (pivot at the chest joint)."""
import math

import numpy as np
from mathutils import Vector

from characters import _body as B
from characters import _kit as kit

import lib

NAME = "char_torso_vest"
META = dict(
    name="Torso: vest", category="character-body", priority="P1",
    description="Sweater-vest with a deep V over a collared shirt, buttons and rolled edges; node Chest",
    tags=["body", "torso", "vest", "smart"], tintable=["Shirt", "Pants", "Accent"],
    anchors_bl={"chestJoint": (0, 0, B.CHEST_Y), "neck": (0, 0, kit.DIM["neckY"])},
    nodes={"Chest": "bends at the chest joint"},
)
TOP, V0 = 0.3, 0.135


def opening(y):
    # Open all the way down (a buttoned placket), widening into the V above V0.
    base = math.radians(1.6)
    return base if y < V0 else base + math.radians(29) * ((y - V0) / (TOP - V0)) ** 0.9


def build():
    lib.begin(NAME)
    M = B.materials(shirt="#F4F6FA", accent="#2E8B7A")
    lower, chest = B.torso(M, emblem=False, verts=14)
    up = [B.crew_collar(M, n=16, ring=5)]
    for s in (1, -1):
        p = B.torso_surface(s * 0.05, 0.296)[0]
        up.append(lib.sphere(f"Collar{s}", 1.0, tuple(p + Vector((0, -0.006, 0))), M["shirt"],
                             scale=(0.056, 0.02, 0.032), u=10, v=6, rot=(-0.35, 0, s * -0.55)))
    prof = B._profile()
    grow = 0.011
    lo_prof = B._slice(prof, B.BELT_Y - 0.012, B.CHEST_Y)
    hi_prof = B._slice(prof, B.CHEST_Y, TOP)
    _, e_lo = B.shell_part("VestLow", lo_prof, M["accent"], opening=opening, grow=grow,
                           normals_from=prof, verts=22, return_edges=True)
    vh, edges = B.shell_part("VestUp", hi_prof, M["accent"], opening=opening, grow=grow,
                             normals_from=prof, verts=22, return_edges=True)
    up.append(vh)
    # Rolled edges round the V and the top, and the hem at the bottom.
    for s in (1, -1):
        up.append(kit.tube(f"Edge{s}", edges[s], 0.0075, M["accent"], ring=5, cap_rings=1))
        kit.tube(f"Placket{s}", e_lo[s], 0.0075, M["accent"], ring=5, cap_rings=1)
    r_top = float(B.torso_r(np.array([TOP]))[0]) + grow
    o = opening(TOP)
    back = [Vector((r_top * math.cos(a), B.Z * r_top * math.sin(a), TOP))
            for a in np.linspace(-math.pi / 2 + o, 1.5 * math.pi - o, 16)]
    up.append(kit.tube("TopEdge", back, 0.0075, M["accent"], ring=5, cap_rings=1))
    for ob in up:
        lib.node(ob, "Chest", pivot=(0, 0, B.CHEST_Y))
    r_b = float(B.torso_r(np.array([B.BELT_Y - 0.012]))[0]) + grow
    B.band("Hem", B.BELT_Y - 0.03, B.BELT_Y - 0.004, r_b, M["accent"], verts=22)
    btn = kit.flat("Buttons", "#F4F6FA", rough=0.4)
    for i, y in enumerate((0.04, 0.08, 0.12)):
        p, n = B.torso_surface(0.0, y)
        lib.sphere(f"Button{i}", 1.0, tuple(p + n * (grow + 0.004)), btn,
                   scale=(0.011, 0.011, 0.011), u=10, v=6)


def finalize(name):
    return kit.finalize(name, META, mount="torso", mq_torso=False, ao=False)
