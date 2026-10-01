"""Fruit bowl: a chunky footed ceramic bowl (tintable `Accent`) heaped with a red and a green
apple (stalks and a leaf), an orange, a bunch of grapes spilling over the rim and two
bananas lying across the top. 0.29 m across; origin at the floor/desk-contact centre."""
import math

from mathutils import Vector

import lib
from decor import _decor as D

NAME = "fruit_bowl"
AO_RES = 256
AO_DISTANCE = 0.05
META = dict(
    name="Fruit bowl", category="food", priority="P1",
    description="Chunky ceramic bowl of apples, an orange, grapes and bananas",
    tags=["break-room", "kitchen", "snack", "healthy"], tintable=["Accent"],
    anchors_bl={},
)
# Outside from the foot up over the rim, then the inside down to a hidden floor.
BOWL = [(0.0, 0.0), (0.056, 0.0), (0.0595, 0.003), (0.0605, 0.011), (0.068, 0.016),
        (0.095, 0.03), (0.118, 0.047), (0.132, 0.064), (0.1395, 0.077), (0.1425, 0.083),
        (0.141, 0.0885), (0.136, 0.0895), (0.1315, 0.086), (0.123, 0.074), (0.105, 0.056),
        (0.08, 0.042), (0.045, 0.033), (0.0, 0.031)]


def materials():
    return dict(
        bowl=D.mat("Accent", "teal", rough=0.4),
        red=D.mat("AppleRed", "#F2484B", rough=0.35),
        green=D.mat("AppleGreen", "#8FD45A", rough=0.4),
        orange=D.mat("Orange", "orange", rough=0.6),
        banana=D.mat("Banana", "#FFD84D", rough=0.5),
        brown=D.mat("Stalk", "#7A5232", rough=0.6),
        grape=D.mat("Grape", "purple", rough=0.3),
        leaf=D.mat("Leaf", "leaf", rough=0.55),
    )


def bowl(M):
    D.lathe("Bowl", BOWL, M["bowl"], verts=40)


def apple(name, M, key, c, r, tilt=0.0):
    a = lib.sphere(f"{name}", r, c, M[key], scale=(1.0, 1.0, 0.9), u=18, v=10,
                   rot=(tilt, 0, 0))
    # A dimple at the top and bottom, where the stalk goes in.
    z0 = c[2]
    for v in a.data.vertices:
        d = math.hypot(v.co.x, v.co.y) / r
        if d < 0.45:
            v.co.z -= math.copysign(0.22 * r * (1 - d / 0.45) ** 2, v.co.z)
    a.data.update()
    top = Vector(c) + Vector((0, math.sin(tilt) * -0.7 * r, 0.7 * r))
    lib.cyl(f"{name}_Stalk", 0.0028, 0.022, tuple(top + Vector((0, 0, 0.008))), M["brown"], r=0.001,
            seg=1, verts=8, rot=(tilt - 0.25, 0.2, 0))
    return top


def leaf(name, M, at, yaw):
    lib.sphere(name, 1.0, tuple(at), M["leaf"], scale=(0.011, 0.021, 0.0028), u=12, v=5,
               rot=(math.radians(-25), 0, yaw))


def grapes(M):
    c = Vector((0.083, -0.062, 0.084))
    pts = [(0, 0, 0), (0.017, 0.004, -0.004), (-0.012, 0.008, -0.006), (0.006, -0.014, -0.008),
           (0.022, -0.012, -0.016), (-0.004, -0.024, -0.018), (0.012, -0.03, -0.028),
           (0.026, -0.026, -0.03), (0.016, -0.042, -0.042)]
    for i, p in enumerate(pts):
        lib.sphere(f"Grape{i}", 0.0118, tuple(c + Vector(p)), M["grape"], scale=(1, 1, 1.08), u=10,
                   v=6)
    D.tube("Grape_Stem", [tuple(c + Vector((-0.006, 0.006, 0.01))), tuple(c + Vector((-0.004, 0.012, 0.022))),
                          tuple(c + Vector((0.004, 0.016, 0.03)))], 0.0022, M["brown"], verts=6,
           smooth=2)


def banana(name, M, p0, p1, bend, lift):
    """A curved banana from p0 to p1, bowed `bend` sideways and `lift` up in the middle."""
    a, b = Vector(p0), Vector(p1)
    side = (b - a).cross(Vector((0, 0, 1))).normalized()
    mid = (a + b) / 2 + side * bend + Vector((0, 0, lift))
    pts = [a, a * 0.75 + mid * 0.25 + Vector((0, 0, lift * 0.4)), mid,
           b * 0.75 + mid * 0.25 + Vector((0, 0, lift * 0.4)), b]
    D.tube(name, [tuple(p) for p in pts], 0.0135, M["banana"], verts=8, smooth=3,
           caps="round", radii=[0.35, 0.85, 1.0, 0.85, 0.4])
    stem = a + (a - mid).normalized() * 0.008
    D.tube(f"{name}_Stem", [tuple(a), tuple(stem + Vector((0, 0, 0.004)))], 0.004, M["brown"],
           verts=6, caps="round")
    lib.sphere(f"{name}_Tip", 0.0045, tuple(b), M["brown"], u=8, v=4)


def build():
    lib.begin(NAME)
    M = materials()
    bowl(M)
    top = apple("Apple_Red", M, "red", (-0.042, 0.03, 0.068), 0.037, tilt=0.15)
    leaf("Apple_Leaf", M, top + Vector((0.012, 0.0, 0.012)), 0.6)
    apple("Apple_Green", M, "green", (0.045, 0.045, 0.066), 0.035, tilt=-0.2)
    lib.sphere("Orange", 0.036, (0.0, -0.045, 0.064), M["orange"], u=18, v=10)
    lib.sphere("Orange_Nub", 0.004, (0.0, -0.045, 0.1), M["leaf"], scale=(1, 1, 0.5), u=8, v=4)
    grapes(M)
    banana("Banana_A", M, (-0.11, -0.03, 0.09), (0.07, 0.035, 0.112), 0.03, 0.03)
    banana("Banana_B", M, (-0.104, -0.045, 0.087), (0.075, 0.012, 0.105), 0.035, 0.026)


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META)
