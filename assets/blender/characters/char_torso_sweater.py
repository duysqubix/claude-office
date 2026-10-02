"""Torso, sweater: a cosy knit `Shirt` sweater worn loose over the pants, with a chunky
ribbed hem band, a rolled crew collar and two `Accent` stripes across the chest. Pivot at
the pelvis joint; the upper body (collar, stripes) is node `Chest` (pivot at the chest
joint)."""
import numpy as np

from characters import _body as B
from characters import _kit as kit

import lib

NAME = "char_torso_sweater"
META = dict(
    name="Torso: sweater", category="character-body", priority="P1",
    description="Cosy knit sweater with a ribbed hem, crew collar and chest stripes; node Chest",
    tags=["body", "torso", "sweater", "knit", "cosy"], tintable=["Shirt", "Pants", "Accent"],
    anchors_bl={"chestJoint": (0, 0, B.CHEST_Y), "neck": (0, 0, kit.DIM["neckY"])},
    nodes={"Chest": "bends at the chest joint"},
)


def build():
    lib.begin(NAME)
    M = B.materials(shirt="#E05A47", accent="#FFF3DE")
    B.torso(M, emblem=False)
    chest = [B.crew_collar(M, n=24, ring=6)]
    chest[0].scale = (1, 1, 1)
    prof = B._profile()
    for i, (y0, y1) in enumerate(((0.165, 0.2), (0.225, 0.25))):
        band = B._slice(prof, y0, y1)
        chest.append(B.shell_part(f"Stripe{i}", band, M["accent"], grow=0.0025, verts=24,
                                  normals_from=prof))
    for ob in chest:
        lib.node(ob, "Chest", pivot=(0, 0, B.CHEST_Y))
    # Loose ribbed hem over the waistband.
    rb = float(B.torso_r(np.array([B.BELT_Y]))[0]) + B.PANTS_OFF + 0.008
    B.ribbed_band("Hem", B.BELT_Y - 0.035, B.BELT_Y + 0.03, lambda y: rb, M["shirt"], n=32,
                  amp=0.0055, rows=4)


def finalize(name):
    return kit.finalize(name, META, mount="torso", mq_torso=False, ao=False)
