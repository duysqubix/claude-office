"""Snack bag: a puffy stand-up bag of chips, tintable `Accent` (tomato red by default) with a
zigzag crimped top, "CRUNCH!" across the top, a smiling chip mascot and a "SEA SALT" flavour
banner, all printed to follow the bulge. 0.17 × 0.23 m; origin at the desk-contact centre;
the front faces -Y."""
import math

import bmesh

import lib
from decor import _decor as D
from decor import _food as F

NAME = "snack_bag"
AO_RES = 256
AO_DISTANCE = 0.04
W, HB, CRIMP, T0 = 0.17, 0.2, 0.026, 0.033
NU, NV = 16, 14
META = dict(
    name="Snack bag", category="food", priority="P1",
    description="Puffy stand-up chip bag with a crimped top and a smiling chip mascot",
    tags=["desk", "snack", "clutter", "break-room"], tintable=["Accent"],
    anchors_bl={"top": (0, 0, HB + CRIMP)},
)


def smooth01(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def widen(v):
    return 1 + 0.035 * math.sin(math.pi * v)


def half_thickness(u, v):
    """u across (0..1), v up (0..1): flat-ish front, pinched sides, sealed at the top, a soft
    rolled edge round the flat bottom."""
    across = max(0.0, 1 - abs(2 * u - 1) ** 3.2) ** 0.5
    up = max(0.0, 1 - v ** 5) ** 0.5 * (1 + 0.07 * math.sin(math.pi * v))
    roll = 0.8 + 0.2 * smooth01(v / 0.07)
    return T0 * across * up * roll


def surface(u, v, side):
    return ((u - 0.5) * W * widen(v), side * half_thickness(u, v), v * HB)


def front_y(x, z):
    v = max(0.0, min(1.0, z / HB))
    u = max(0.0, min(1.0, x / (W * widen(v)) + 0.5))
    return -half_thickness(u, v)


def materials():
    return dict(
        bag=D.mat("Accent", "#FF5A4E", rough=0.3),
        white=D.mat("PrintWhite", "paper", rough=0.4),
        yellow=D.mat("PrintChip", "#FFD84D", rough=0.45),
        ink=D.mat("PrintInk", "ink", rough=0.5),
    )


def pouch(M):
    bm = bmesh.new()
    front = [[None] * (NV + 1) for _ in range(NU + 1)]
    back = [[None] * (NV + 1) for _ in range(NU + 1)]
    for i in range(NU + 1):
        for j in range(NV + 1):
            u, v = i / NU, j / NV
            front[i][j] = bm.verts.new(surface(u, v, -1))
            sealed = i in (0, NU) or j == NV
            back[i][j] = front[i][j] if sealed else bm.verts.new(surface(u, v, 1))
    for i in range(NU):
        for j in range(NV):
            bm.faces.new((front[i][j], front[i + 1][j], front[i + 1][j + 1], front[i][j + 1]))
            bm.faces.new((back[i][j + 1], back[i + 1][j + 1], back[i + 1][j], back[i][j]))
    ring = [front[i][0] for i in range(NU + 1)] + [back[i][0] for i in range(NU - 1, 0, -1)]
    bm.faces.new(list(reversed(ring)))  # flat bottom, facing down
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
    D.bm_object("Bag", bm, M["bag"])
    # Crimped seal: a flat band with a zigzag top edge.
    teeth = 17
    top = [(W / 2 - W * k / (2 * teeth), CRIMP + (0.0 if k % 2 == 0 else -0.0045))
           for k in range(2 * teeth + 1)]
    outline = [(-W / 2, 0.0), (W / 2, 0.0)] + top
    D.prism("Crimp", outline, 0.005, M["bag"], loc=(0, 0.0025, HB - 0.006), rot=D.FRONT,
            r=0.0012, seg=1, angle=60)


def conform(ob, lift):
    """Lay a front-facing decal onto the bag's bulging front."""
    D.bake_xform(ob)
    F.fine(ob, 0.004)
    for v in ob.data.vertices:
        v.co.y = front_y(v.co.x, v.co.z) - lift
    ob.data.update()
    return ob


def prints(M):
    t = D.text("Print_Crunch", "CRUNCH!", 0.027, M["white"], loc=(0, 0, 0.158), depth=0, res=2)
    conform(t, 0.0007)
    chip = D.rounded_pts([(-0.04, -0.026), (0.04, -0.026), (0.004, 0.036)], 0.012, steps=4)
    conform(D.face("Print_Chip", chip, M["yellow"], loc=(0, 0, 0.094), rot=D.FRONT), 0.0007)
    for s in (-1, 1):
        conform(D.face(f"Print_Eye{s}", D.circle_pts(0.0042, 12, sy=1.35), M["ink"],
                       loc=(s * 0.011 + 0.001, 0, 0.096), rot=D.FRONT), 0.0013)
    arc = [math.pi * (1.08 + 0.84 * k / 10) for k in range(11)]
    smile = ([(0.011 * math.cos(a), 0.011 * math.sin(a)) for a in arc]
             + [(0.0072 * math.cos(a), 0.0072 * math.sin(a) - 0.0012) for a in reversed(arc)])
    conform(D.face("Print_Smile", smile, M["ink"], loc=(0.001, 0, 0.088), rot=D.FRONT), 0.0013)
    conform(D.face("Print_Banner", D.rrect_pts(0.112, 0.024, 0.012, steps=3), M["yellow"],
                   loc=(0, 0, 0.038), rot=D.FRONT), 0.0007)
    t = D.text("Print_Flavour", "SEA SALT", 0.0135, M["ink"], loc=(0, 0, 0.038), depth=0, res=2)
    conform(t, 0.0013)


def build():
    lib.begin(NAME)
    M = materials()
    pouch(M)
    prints(M)


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META)
