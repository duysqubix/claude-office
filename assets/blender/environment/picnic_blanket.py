"""Picnic blanket: a red gingham blanket (1.8 × 1.4 m) lying on the grass with a soft ripple
at its ends, and a picnic on it: a wicker basket with a cloth peeking out, a thermos and a
plate of three sandwiches in the middle. Seats for three around the plate. Origin at the
ground centre; the blanket's long side runs along X."""
import math

import bmesh
from mathutils import Matrix

import lib
from environment import _env

NAME = "picnic_blanket"
AO_RES = 512
AO_DISTANCE = 0.2

BW, BD = 1.8, 1.4     # blanket size (x, y)
NX, NY = 10, 8        # gingham squares
TOP = 0.012           # blanket top face over the flat middle
PLATE = (0.1, 0.02)
BASKET = (-0.46, 0.37)
THERMOS = (-0.1, 0.45)
SEATS = {"sitA": (-0.56, -0.38), "sitB": (0.5, -0.4), "sitC": (0.64, 0.38)}
FOOD = 1.3            # the picnic is chunky, so it reads from the game camera


def materials():
    return dict(
        red=lib.mat("GinghamRed", lib.P["chairs"][0], rough=0.85),
        pink=lib.mat("GinghamPink", "#FFA5A3", rough=0.85),
        white=lib.mat("GinghamWhite", lib.P["deskTop"], rough=0.85),
        wicker=lib.mat("Wicker", "#D9A066", rough=0.8),
        weave=lib.mat("WickerDark", "#B07A45", rough=0.8),
        sky=lib.mat("Thermos", lib.P["deskAccents"][2], rough=0.4),
        cream=lib.mat("Cream", lib.P["deskTop"], rough=0.5),
        plate=lib.mat("Plate", lib.P["paper"], rough=0.35),
        bread=lib.mat("Bread", "#F2D49B", rough=0.8),
        lettuce=lib.mat("Lettuce", lib.P["plantLeaf"], rough=0.7),
        cheese=lib.mat("Cheese", lib.P["deskAccents"][1], rough=0.6),
    )


def top_z(x, y):
    """The blanket's top face: flat in the middle where the picnic sits, a soft ripple
    toward the short ends."""
    edge = max(0.0, abs(x) / (BW / 2) - 0.62) / 0.38
    return TOP + 0.009 * edge * (0.5 + 0.5 * math.sin(y * 9 + x * 3))


def blanket(M):
    """Gingham: white, pink where one stripe runs, red where two cross. Top face plus a rim
    band down to the grass (the underside is never seen)."""
    bm = bmesh.new()
    v = {}
    for i in range(NX + 1):
        for j in range(NY + 1):
            x, y = -BW / 2 + BW * i / NX, -BD / 2 + BD * j / NY
            v[i, j] = bm.verts.new((x, y, top_z(x, y)))
            if i in (0, NX) or j in (0, NY):
                v[i, j, "g"] = bm.verts.new((x, y, 0.0))
    for i in range(NX):
        for j in range(NY):
            f = bm.faces.new((v[i, j], v[i + 1, j], v[i + 1, j + 1], v[i, j + 1]))
            f.material_index = (i % 2) + (j % 2)          # 0 white, 1 pink, 2 red
    ring = [(i, 0) for i in range(NX)] + [(NX, j) for j in range(NY)] + \
        [(i, NY) for i in range(NX, 0, -1)] + [(0, j) for j in range(NY, 0, -1)]
    for k, a in enumerate(ring):
        b = ring[(k + 1) % len(ring)]
        f = bm.faces.new((v[a], v[a + ("g",)], v[b + ("g",)], v[b]))
        f.material_index = 2
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = lib._link("Blanket", bm, None, smooth=False)
    for name in ("white", "pink", "red"):
        ob.data.materials.append(M[name])


def basket(M, x, y, yaw=12):
    parts = [
        lib.rbox("BasketBody", (0.34, 0.22, 0.16), (0, 0, 0.08), M["wicker"], r=0.03, seg=2),
        lib.rbox("BasketBand0", (0.352, 0.232, 0.022), (0, 0, 0.05), M["weave"], r=0.011, seg=1),
        lib.rbox("BasketBand1", (0.352, 0.232, 0.022), (0, 0, 0.115), M["weave"], r=0.011,
                 seg=1),
        lib.rbox("BasketLidA", (0.35, 0.115, 0.022), (0, -0.056, 0.168), M["wicker"], r=0.01,
                 seg=1),
        lib.rbox("BasketLidB", (0.35, 0.115, 0.022), (0, 0.056, 0.168), M["wicker"], r=0.01,
                 seg=1),
        # A corner of the red cloth lining caught under the lid.
        lib.sphere("BasketCloth", 1.0, (0.12, -0.112, 0.15), M["red"], scale=(0.05, 0.025, 0.03),
                   u=10, v=6),
        lib.torus("BasketHandle", 0.13, 0.012, (0, 0, 0.178), M["weave"], seg=12, ring=6,
                  sweep=math.pi, rot=(math.pi / 2, 0, 0)),
    ]
    place(parts, x, y, yaw)


def place(parts, x, y, yaw=0.0):
    """Set a picnic item (built around its own base centre) down on the blanket."""
    m = Matrix.Translation((x, y, top_z(x, y))) @ Matrix.Rotation(math.radians(yaw), 4, "Z") @ \
        Matrix.Scale(FOOD, 4)
    for o in parts:
        o.matrix_basis = m @ o.matrix_basis


def thermos(M, x, y):
    place([lib.lathe("ThermosBody", [(0, 0), (0.044, 0), (0.048, 0.01), (0.048, 0.19),
                                     (0.04, 0.205), (0.03, 0.21), (0, 0.21)],
                     material=M["sky"], verts=14),
           lib.cyl("ThermosBand", 0.0495, 0.03, (0, 0, 0.07), M["cream"], r=0.004, seg=1,
                   verts=14),
           lib.cyl("ThermosCup", 0.052, 0.06, (0, 0, 0.235), M["cream"], r=0.01, seg=1,
                   verts=14)], x, y)


def tri(side, r=0.012):
    """A rounded triangle outline (counter-clockwise), centred on its centroid."""
    pts = []
    for k in range(3):
        a = math.pi / 2 + 2 * math.pi * k / 3
        cx, cy = side / math.sqrt(3) * math.cos(a), side / math.sqrt(3) * math.sin(a)
        for i in range(3):
            b = a - math.pi / 3 + math.pi / 3 * i
            pts.append((cx - r * 2 * math.cos(a) + r * math.cos(b),
                        cy - r * 2 * math.sin(a) + r * math.sin(b)))
    return pts


def sandwiches(M, x, y):
    parts = [lib.lathe("Plate", [(0, 0), (0.1, 0), (0.125, 0.012), (0.142, 0.022),
                                 (0.136, 0.026), (0.11, 0.012), (0, 0.009)],
                       material=M["plate"], verts=20)]
    for k, fill in enumerate(("lettuce", "cheese", "lettuce")):
        a = math.radians(90 + 120 * k)
        cx, cy = 0.05 * math.cos(a), 0.05 * math.sin(a)
        spin = (0, 0, a + math.pi / 2)
        parts.append(lib.slab(f"Bread{k}", tri(0.085), 0.009, 0.045, loc=(cx, cy, 0),
                              material=M["bread"], r=0.006, seg=1, rot=spin))
        parts.append(lib.slab(f"Filling{k}", tri(0.094), 0.022, 0.031, loc=(cx, cy, 0),
                              material=M[fill], r=0.003, seg=1, rot=spin))
    place(parts, x, y, yaw=-10)


def build():
    lib.begin(NAME)
    M = materials()
    blanket(M)
    basket(M, *BASKET)
    thermos(M, *THERMOS)
    sandwiches(M, *PLATE)


META = dict(
    name="Picnic blanket",
    category="outdoor",
    priority="P1",
    artist="Claude Rodin",
    description="Red gingham picnic blanket with a wicker basket, a thermos and a plate of "
                "sandwiches",
    tags=["garden", "picnic", "seating", "lunch"],
    tintable=[],
    anchors_bl=dict({k: (sx, sy, top_z(sx, sy)) for k, (sx, sy) in SEATS.items()},
                    plate=(PLATE[0], PLATE[1], top_z(*PLATE))),
    notes="Three sitters on the blanket (sitA, sitB, sitC: on its top face, like the bench's "
          "seats), each facing the 'plate' in the middle.",
)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META)
