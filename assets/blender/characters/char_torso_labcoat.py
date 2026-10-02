"""Torso, labcoat: an open white lab coat (`Accent`, recolour it for a chef or a doctor) over
a pale `Shirt`, flaring down over the hips, with big lapels, two hip pockets and a breast
pocket stuffed with pens. Pivot at the pelvis joint; everything above the chest joint is
node `Chest`."""
import math

import numpy as np
from mathutils import Vector

from characters import _body as B
from characters import _kit as kit

import lib

NAME = "char_torso_labcoat"
META = dict(
    name="Torso: labcoat", category="character-body", priority="P1",
    description="Open white lab coat with lapels, hip pockets and pens; node Chest",
    tags=["body", "torso", "labcoat", "science"], tintable=["Shirt", "Pants", "Accent"],
    anchors_bl={"chestJoint": (0, 0, B.CHEST_Y), "neck": (0, 0, kit.DIM["neckY"])},
    nodes={"Chest": "bends at the chest joint"},
)
TOP, BOTTOM, GROW = 0.31, -0.13, 0.016


def coat_r(y):
    """Coat radius: the shirt bean plus room, flaring out below the belly."""
    y = np.asarray(y, dtype=np.float64)
    base = B.torso_r(np.clip(y, 0.0, 0.41)) + GROW
    return base + np.where(y < 0.0, -y * 0.42, 0.0)


def opening(y):
    if y < 0.14:
        return math.radians(7)
    return math.radians(7 + 30 * ((y - 0.14) / (TOP - 0.14)) ** 1.2)


def coat_prof(y0, y1, n):
    return [(float(coat_r(y)) - GROW, float(y)) for y in np.linspace(y0, y1, n)]


def build():
    lib.begin(NAME)
    M = B.materials(shirt="#CFE3FF", accent="#F7F9FC")
    lower, chest = B.torso(M, emblem=False, verts=14)
    up = [B.crew_collar(M, n=16, ring=5)]
    full = coat_prof(BOTTOM, TOP, 16)
    lo = coat_prof(BOTTOM, B.CHEST_Y, 8)
    hi = coat_prof(B.CHEST_Y, TOP, 7)
    _, e_lo = B.shell_part("CoatLow", lo, M["accent"], opening=opening, grow=GROW,
                           normals_from=full, return_edges=True, verts=22)
    ch, e_hi = B.shell_part("CoatUp", hi, M["accent"], opening=opening, grow=GROW,
                            normals_from=full, return_edges=True, verts=22)
    up.append(ch)
    # Lapels: fat rolled edges up the V, folding out at the top.
    for s in (1, -1):
        e = e_hi[s]
        up.append(kit.tube(f"Lapel{s}", e, 0.011, M["accent"], ring=5, cap_rings=1))
        tip = e[-1]
        up.append(lib.sphere(f"LapelFlap{s}", 1.0, tuple(tip + Vector((s * 0.03, -0.012, -0.04))),
                             M["accent"], scale=(0.05, 0.016, 0.06), u=10, v=6,
                             rot=(-0.25, 0, s * 0.55)))
        kit.tube(f"Front{s}", e_lo[s], 0.009, M["accent"], ring=5, cap_rings=1)
    # Hem round the bottom, open at the front.
    rb = float(coat_r(BOTTOM))
    o = opening(BOTTOM)
    hem = [Vector((rb * math.cos(a), B.Z * rb * math.sin(a), BOTTOM))
           for a in np.linspace(-math.pi / 2 + o, 1.5 * math.pi - o, 18)]
    kit.tube("Hem", hem, 0.009, M["accent"], ring=5, cap_rings=1)
    # Pockets: two at the hips, one on the chest with pens.
    for s in (1, -1):
        B.surface_patch(f"Pocket{s}", M["accent"], 0.055, -0.08, 0.0, x_c=s * 0.13,
                        out=GROW + 0.004, thick=0.008, rnd=0.012, target=110,
                        radius_fn=coat_r)
    bp = B.surface_patch("BreastPocket", M["accent"], 0.04, 0.15, 0.205, x_c=0.11,
                         out=GROW + 0.003, thick=0.007, rnd=0.01, target=100)
    up.append(bp)
    for i, (dx, col) in enumerate(((-0.014, "#3D7CFF"), (0.006, "#E63946"), (0.022, "#2B2D42"))):
        p, n = B.torso_surface(0.11 + dx, 0.205)
        pen = lib.cyl(f"Pen{i}", 0.0065, 0.05, tuple(p + n * (GROW + 0.01) + Vector((0, 0, 0.006))),
                      kit.flat(f"Pen{i}", col, rough=0.4), r=0.003, seg=1, verts=6)
        up.append(pen)
    for ob in up:
        lib.node(ob, "Chest", pivot=(0, 0, B.CHEST_Y))


def finalize(name):
    return kit.finalize(name, META, mount="torso", mq_torso=False, ao=False, mq_raise=0.12)
