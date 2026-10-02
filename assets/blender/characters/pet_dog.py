"""Office dog: a chunky golden puppy standing on four stubby legs. A soft bean body with a
cream chest and socks, a big round head with a cream snout, a shiny button nose, a pink
tongue poking out, big glossy eyes, floppy dark ears, and a happy little curl of a tail.
An `Accent` collar with a gold tag. Nodes: `Head` (pivots at the neck: look around by
turning it about Y) and `Tail` (pivots at its root: wag about Y). Origin on the floor under
the middle of the body; the dog faces -Y (three.js +Z)."""
import math

from mathutils import Vector

from characters import _kit as kit
from characters import _lorrain as lo

import lib

NAME = "pet_dog"
NECK = Vector((0.0, -0.13, 0.285))
TAIL_ROOT = Vector((0.0, 0.2, 0.25))
HEAD_C = Vector((0.0, -0.2, 0.39))
META = lo.meta(
    "Office dog", "pet", "P2",
    "Chunky golden office puppy with floppy ears and a tag on its collar; nodes Head and Tail",
    ["pet", "dog", "puppy", "animal", "office"], ["Accent"],
    anchors_bl={"head": tuple(HEAD_C), "collar": (0.0, -0.215, 0.255)},
    nodes={"Head": "look around: rotate about Y (three.js) at its origin (the neck)",
           "Tail": "wag: rotate about Y (three.js) at its origin (the tail root)"},
    notes="Fur, FurLight and FurDark can be recoloured by name for other coats.",
)


def body(P):
    S = kit
    d = S.sd_ellipsoid(P, (0, 0.04, 0.205), (0.138, 0.2, 0.128))
    for sx in (1, -1):
        d = S.smin(d, S.sd_capsule(P, (sx * 0.074, -0.1, 0.18), (sx * 0.074, -0.108, 0.05),
                                   0.048), 0.03)
        d = S.smin(d, S.sd_ellipsoid(P, (sx * 0.078, 0.14, 0.17), (0.066, 0.09, 0.08)), 0.03)
        d = S.smin(d, S.sd_capsule(P, (sx * 0.08, 0.155, 0.15), (sx * 0.08, 0.16, 0.05), 0.05),
                   0.03)
    return d


def head(P):
    S = kit
    d = S.sd_ellipsoid(P, tuple(HEAD_C), (0.142, 0.132, 0.13))
    # A rounded forehead and full cheeks.
    d = S.smin(d, S.sd_ellipsoid(P, (0.0, -0.24, 0.45), (0.1, 0.08, 0.07)), 0.04)
    for sx in (1, -1):
        d = S.smin(d, S.sd_ellipsoid(P, (sx * 0.075, -0.25, 0.345), (0.07, 0.065, 0.06)), 0.03)
    return d


def ears(M):
    for sx in (1, -1):
        # Floppy ears hanging from the top corners of the head, tipped forward a little.
        lo.blob(f"Ear{sx}", (sx * 0.142, -0.19, 0.385), (0.032, 0.062, 0.095), M["dark"],
                (sx * 1, -0.25, 0.0), roll=sx * 12, u=16, v=10)


def face(M):
    for sx in (1, -1):
        lo.eye(f"Eye{sx}", (sx * 0.062, -0.314, 0.418), (sx * 0.16, -1, 0.15), M)
    lo.blob("Snout", (0.0, -0.33, 0.34), (0.076, 0.07, 0.062), M["light"], u=18, v=10)
    lo.blob("Nose", (0.0, -0.4, 0.372), (0.03, 0.02, 0.022), M["nose"], u=14, v=8)
    lo.blob("NoseShine", (-0.008, -0.414, 0.383), (0.007, 0.004, 0.005), M["shine"], u=8, v=5)
    m = [(-0.03, -0.392, 0.322), (-0.014, -0.4, 0.312), (0.0, -0.398, 0.322),
         (0.014, -0.4, 0.312), (0.03, -0.392, 0.322)]
    kit.tube("Mouth", m, 0.0045, M["mouth"], ring=6, cap_rings=2)
    lo.blob("Tongue", (0.012, -0.392, 0.296), (0.022, 0.016, 0.03), M["tongue"],
            (0, -1, -0.35), u=12, v=8)


def collar(M):
    axis = (HEAD_C - NECK + Vector((0, 0.06, -0.04))).normalized()
    across, up = Vector((1, 0, 0)), axis.cross(Vector((1, 0, 0))).normalized()
    ring = [NECK + across * 0.098 * math.cos(a) + up * 0.086 * math.sin(a)
            for a in (2 * math.pi * k / 24 for k in range(24))]
    kit.ring_tube("Collar", [tuple(p) for p in ring], 0.018, M["collar"], ring=7)
    lo.blob("Tag", (0.0, -0.228, 0.232), (0.024, 0.006, 0.024), M["gold"], (0, -1, -0.3),
            u=14, v=6)


def tail(M):
    pts, radii = lo.smooth_lock(
        [TAIL_ROOT - Vector((0, 0.035, 0.01)), (0, 0.265, 0.295), (0, 0.29, 0.36),
         (0, 0.268, 0.405)],
        [0.04, 0.038, 0.034, 0.028], samples=12)
    return kit.tube("Tail_Fur", [tuple(p) for p in pts], radii, M["fur"], ring=12)


def build():
    lib.begin(NAME)
    M = lo.pet_materials("#E3A15E", "#FFF1DC", "#A8683A")
    M["tongue"] = lib.mat("Tongue", kit.COL["tongue"], rough=0.5)
    lo.sculpt("Body", body, (-0.22, -0.22, -0.01), (0.22, 0.29, 0.36), M["fur"], 1050)
    for sx in (1, -1):
        lo.blob(f"Paw{sx}F", (sx * 0.074, -0.118, 0.03), (0.052, 0.06, 0.031), M["light"],
                u=14, v=8)
        lo.blob(f"Paw{sx}B", (sx * 0.08, 0.15, 0.03), (0.054, 0.062, 0.031), M["light"],
                u=14, v=8)
    lo.blob("Chest", (0.0, -0.145, 0.215), (0.08, 0.05, 0.095), M["light"], u=16, v=8)
    collar(M)
    head_ob = lo.sculpt("Head_Fur", head, (-0.22, -0.38, 0.2), (0.22, -0.02, 0.56), M["fur"],
                        1100)
    ears(M)
    face(M)
    for o in list(lib.coll().objects):
        if o is head_ob or o.name.startswith(("Eye", "Ear", "Snout", "Nose", "Mouth",
                                               "Tongue")):
            lib.node(o, "Head", pivot=tuple(NECK))
    lib.node(tail(M), "Tail", pivot=tuple(TAIL_ROOT))


def finalize(name):
    return kit.finalize(name, META, mount=None, lift=(0, 0, 0), ao_res=512, ao_distance=0.1)
