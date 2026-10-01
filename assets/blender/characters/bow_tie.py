"""Bow tie: a chunky puffy bow tie at the front of the crew neck. Two pinched pillowy wings
and a fat knot, in `Accent`. Pivot at the torso origin (pelvis)."""
import math

from mathutils import Vector

from characters import _body as B
from characters import _kit as kit
from characters import _monet as mo

import lib

NAME = "bow_tie"
META = mo.meta("Bow tie", "character-accessory", "Chunky puffy bow tie", ["bow-tie", "formal",
               "accessory"], priority="P1")


def build():
    lib.begin(NAME)
    m = kit.m_accent("#E63946", rough=0.55)
    ring = B.neck_ring(out=0.0)
    front = min(ring, key=lambda p: p.y)
    p, n = B.torso_surface(0.0, front.z - 0.03)
    c = p + n * 0.016          # snug against the collar
    META["anchors_bl"] = {"knot": tuple(c)}
    for s in (1, -1):
        w = lib.blob(f"Wing{s}", 0.03, tuple(c + Vector((s * 0.05, 0.0, 0.0))), m,
                     scale=(1.5, 0.75, 1.15), levels=2, rot=(0, s * 0.12, 0))
        # Pinch toward the knot: narrow the inner end.
        for v in w.data.vertices:
            t = 0.5 - s * v.co.x / 0.06
            v.co.z *= 1.0 - 0.45 * max(0.0, min(1.0, t))
    lib.blob("Knot", 0.018, tuple(c + Vector((0, -0.006, 0))), m, scale=(1.0, 0.9, 1.1), levels=2)


def finalize(name):
    return mo.finalize_torso_item(name, META, ao_distance=0.03)
