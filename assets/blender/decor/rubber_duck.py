"""Rubber duck: the desk's debugging partner. Plump flat-bottomed body with an upturned
pointy tail, big round head, chunky orange bill, glossy eyes with catchlights, pink cheeks
and teardrop wings. 0.09 m tall, facing -Y; origin at the desk-contact centre."""
import math

from mathutils import Vector

import lib
from decor import _decor as D

NAME = "rubber_duck"
AO_RES = 256
AO_DISTANCE = 0.03
META = dict(
    name="Rubber duck", category="desk-item", priority="P0",
    description="Glossy yellow rubber duck with a big head, pink cheeks and an upturned tail",
    tags=["desk", "clutter", "debugging"], tintable=[],
    anchors_bl={"headTop": (0, -0.017, 0.0895)},
)
HEAD = Vector((0, -0.017, 0.064))
HEAD_R = 0.0255


def materials():
    return dict(
        duck=D.mat("Duck", "duck", rough=0.35),
        bill=D.mat("Bill", "orange", rough=0.4),
        eye=D.mat("Eye", "eye", rough=0.2),
        shine=D.mat("Shine", "paper", rough=0.2),
        cheek=D.mat("Cheek", "cheek", rough=0.6),
    )


def _n(k, detail):
    return max(6, int(round(k * detail)))


def body(M, detail=1.0):
    q = lambda k: _n(k, detail)  # noqa: E731
    b = lib.sphere("Body", 0.036, (0, 0.004, 0.028), M["duck"], scale=(1.0, 1.25, 0.78),
                   u=q(28), v=q(14))
    D.flatten_below(b, 0.002)
    D.tube("Body_Tail", [(0, 0.026, 0.034), (0, 0.042, 0.043), (0, 0.052, 0.055),
                         (0, 0.056, 0.066)], 0.0175, M["duck"], verts=q(14),
           smooth=max(2, q(4)), radii=[1.0, 0.82, 0.52, 0.22])
    for s in (-1, 1):
        lib.sphere(f"Wing{s}", 0.0145, (s * 0.0332, 0.01, 0.029), M["duck"],
                   scale=(0.3, 1.15, 0.55), u=q(14), v=q(8),
                   rot=(math.radians(-22), 0, s * math.radians(-6)))


def head(M, detail=1.0, features=True):
    q = lambda k: _n(k, detail)  # noqa: E731
    lib.sphere("Head", HEAD_R, tuple(HEAD), M["duck"], u=q(24), v=q(12))
    lib.sphere("Bill_Upper", 0.0125, tuple(HEAD + Vector((0, -0.024, -0.004))), M["bill"],
               scale=(1.15, 1.0, 0.42), u=q(16), v=q(8), rot=(math.radians(-8), 0, 0))
    lib.sphere("Bill_Lower", 0.0105, tuple(HEAD + Vector((0, -0.021, -0.0085))), M["bill"],
               scale=(1.0, 0.9, 0.34), u=q(16), v=q(8), rot=(math.radians(6), 0, 0))
    for s in (-1, 1):
        n = Vector((s * 0.43, -0.87, 0.26)).normalized()
        e = HEAD + n * (HEAD_R - 0.0008)
        yaw = math.atan2(n.x, -n.y)
        lib.sphere(f"Eye{s}", 0.0052, tuple(e), M["eye"], scale=(0.85, 0.55, 1.15), u=q(12),
                   v=q(8), rot=(-math.asin(n.z) * 0.8, 0, yaw))
        if not features:
            continue
        # Flat catchlight up and to the viewer's left, lying on the eye's surface.
        lib.sphere(f"Shine{s}", 0.0016, tuple(e + n * 0.0022 + Vector((-0.0011, 0, 0.002))),
                   M["shine"], scale=(1, 0.45, 1), u=q(10), v=6,
                   rot=(-math.asin(n.z) * 0.8, 0, yaw))
        c = Vector((s * 0.74, -0.62, -0.08)).normalized()
        lib.sphere(f"Cheek{s}", 0.0052, tuple(HEAD + c * (HEAD_R - 0.0009)), M["cheek"],
                   scale=(0.55, 0.3, 0.42), u=q(10), v=6,
                   rot=(0, 0, math.atan2(c.x, -c.y)))


def make(M, detail=1.0, features=True):
    """The duck at the origin (shared with cardboard_box, which uses a lighter detail and
    drops the catchlights and cheeks it's too small to show)."""
    body(M, detail)
    head(M, detail, features)


def build():
    lib.begin(NAME)
    make(materials(), detail=0.86)


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META)
