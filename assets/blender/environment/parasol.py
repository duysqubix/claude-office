"""Parasol: a beach umbrella for the yard's lounge stop: a weighted slate base, a honey-wood
pole with a tilt joint, and a big octagonal canopy in the awnings' Claude orange and cream
stripes, scalloped between the ribs, ribs underneath and a ball finial on top. 2.3 m tall,
2.2 m across;
the canopy leans 8° toward the front. A closed shell, so it reads from the loungers below.
Origin at the ground centre of the base."""
import math

import bmesh
from mathutils import Matrix, Vector

import lib
from environment import _env

NAME = "parasol"
AO_RES = 512
AO_DISTANCE = 0.25

JOINT_Z = 1.5         # tilt joint on the pole
TILT = math.radians(8)
CANOPY_UP = 0.7       # apex above the joint
R = 1.1               # canopy radius (to a rib tip)
RISE = 0.32           # apex above the rim
THICK = 0.02
PANELS = 8


def materials():
    return dict(
        coral=lib.mat("Stripe", _env.P["claude"], rough=0.6),
        cream=lib.mat("Cream", "#FFF4E3", rough=0.6),
        wood=lib.mat("Wood", lib.P["wood"], rough=0.6),
        base=lib.mat("Slate", _env.P["doorFrame"], rough=0.55),
    )


def canopy_point(rho, ang, top=True):
    """A point on the canopy at radius rho along a rib (ang radians), apex at the origin."""
    z = -RISE * (rho / R) ** 1.3 - (0 if top else THICK)
    return Vector((rho * math.cos(ang), rho * math.sin(ang), z))


def canopy(M):
    """Flat panels between the ribs (the mid-panel vertices sit on the chords), the rim
    scalloped up between rib tips; top and underside joined by a rim band."""
    bm = bmesh.new()
    n = 2 * PANELS
    chord = math.cos(math.pi / PANELS)
    rings = (0.36, 0.7, 1.0)
    shells = []
    for top in (True, False):
        apex = bm.verts.new(canopy_point(0.0, 0.0, top))
        layers = []
        for k, frac in enumerate(rings):
            ring = []
            for j in range(n):
                ang = math.pi * j / PANELS
                rho = R * frac * (chord if j % 2 else 1.0)
                p = canopy_point(rho, ang, top)
                if j % 2 and k == len(rings) - 1:
                    p.z += 0.035       # scallop: the hem lifts between the rib tips
                ring.append(bm.verts.new(p))
            layers.append(ring)
        shells.append((apex, layers))
    for s, (apex, layers) in enumerate(shells):
        flip = s == 1
        for j in range(n):
            a, b = layers[0][j], layers[0][(j + 1) % n]
            f = bm.faces.new((apex, b, a) if flip else (apex, a, b))
            f.material_index = (j // 2) % 2
        for k in range(len(layers) - 1):
            for j in range(n):
                a, b = layers[k][j], layers[k][(j + 1) % n]
                c, d = layers[k + 1][(j + 1) % n], layers[k + 1][j]
                f = bm.faces.new((a, d, c, b) if flip else (a, b, c, d))
                f.material_index = (j // 2) % 2
    top_rim, bottom_rim = shells[0][1][-1], shells[1][1][-1]
    for j in range(n):
        a, b = top_rim[j], top_rim[(j + 1) % n]
        f = bm.faces.new((a, bottom_rim[j], bottom_rim[(j + 1) % n], b))
        f.material_index = (j // 2) % 2
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = lib._link("Canopy", bm, None, smooth=False)
    ob.data.materials.append(M["cream"])
    ob.data.materials.append(M["coral"])
    return ob


def head(M):
    """Everything above the tilt joint, built upright around the joint."""
    parts = [canopy(M)]
    for o in parts:
        o.location = (0, 0, CANOPY_UP)
    parts.append(_env.tube("PoleTop", (0, 0, 0.0), (0, 0, CANOPY_UP - 0.02), 0.026,
                           material=M["wood"], verts=10, round_ends=False))
    for i in range(PANELS):
        ang = 2 * math.pi * i / PANELS
        a = canopy_point(0.06, ang, top=False) + Vector((0, 0, CANOPY_UP - 0.008))
        b = canopy_point(R * 0.97, ang, top=False) + Vector((0, 0, CANOPY_UP - 0.008))
        parts.append(_env.tube(f"Rib{i}", a, b, 0.009, material=M["wood"], verts=5,
                               round_ends=False))
    parts.append(lib.cyl("Hub", 0.045, 0.05, (0, 0, CANOPY_UP - 0.04), M["coral"], r=0.012,
                         seg=1, verts=12))
    parts.append(lib.sphere("Finial", 0.055, (0, 0, CANOPY_UP + 0.045), M["coral"], u=12, v=6))
    parts.append(lib.torus("Runner", 0.03, 0.014, (0, 0, CANOPY_UP - 0.38), M["coral"], seg=12,
                           ring=6))
    m = Matrix.Translation((0, 0, JOINT_Z)) @ Matrix.Rotation(TILT, 4, "X")
    for o in parts:
        o.matrix_basis = m @ o.matrix_basis


def stand(M):
    prof = [(0.0, 0.0), (0.27, 0.0), (0.29, 0.02), (0.28, 0.06), (0.22, 0.09), (0.09, 0.12),
            (0.06, 0.17), (0.0, 0.17)]
    lib.lathe("Base", prof, material=M["base"], verts=24)
    _env.tube("Pole", (0, 0, 0.16), (0, 0, JOINT_Z), 0.03, material=M["wood"], verts=10,
              round_ends=False)
    lib.sphere("Joint", 0.05, (0, 0, JOINT_Z), M["coral"], u=12, v=8)


def build():
    lib.begin(NAME)
    M = materials()
    stand(M)
    head(M)


META = dict(
    name="Parasol",
    category="outdoor",
    priority="P1",
    artist="Claude Rodin",
    description="Beach umbrella in orange and cream stripes on a weighted base, canopy tilted",
    tags=["garden", "shade", "lounge", "umbrella"],
    tintable=[],
    # The finial's tip, where the canopy's lean puts it.
    anchors_bl={"top": tuple(Matrix.Translation((0, 0, JOINT_Z)) @ Matrix.Rotation(TILT, 4, "X")
                             @ Vector((0, 0, CANOPY_UP + 0.1)))},
    notes="Stands between the two sun loungers; the canopy leans 8° toward +Z, its hem about "
          "1.7 m up at the lowest point.",
)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META)
