"""Office cat: a chunky ginger cat standing on four stubby legs. A soft bean body with cream
socks and chest, a big round head with puffy cheeks, rounded ears with pink insides, big
glossy eyes, a pink nose, a tiny "w" mouth, whiskers and three tabby stripes on the brow,
and a question-mark tail. An `Accent` collar with a little gold bell. Nodes: `Head` (pivots
at the neck: look around by turning it about Y) and `Tail` (pivots at its root: wag about
Y). Origin on the floor under the middle of the body; the cat faces -Y (three.js +Z)."""
import math

from mathutils import Vector

from characters import _kit as kit
from characters import _lorrain as lo

import lib

NAME = "pet_cat"
NECK = Vector((0.0, -0.11, 0.245))
TAIL_ROOT = Vector((0.0, 0.17, 0.2))
HEAD_C = Vector((0.0, -0.175, 0.335))
META = lo.meta(
    "Office cat", "pet", "P2",
    "Chunky ginger office cat with a collar and bell; nodes Head (look around) and Tail (wag)",
    ["pet", "cat", "animal", "office"], ["Accent"],
    anchors_bl={"head": tuple(HEAD_C), "collar": (0.0, -0.19, 0.22)},
    nodes={"Head": "look around: rotate about Y (three.js) at its origin (the neck)",
           "Tail": "wag: rotate about Y (three.js) at its origin (the tail root)"},
    notes="Fur, FurLight and FurDark can be recoloured by name for other coats.",
)


def body(P):
    S = kit
    d = S.sd_ellipsoid(P, (0, 0.03, 0.17), (0.118, 0.168, 0.112))
    for sx in (1, -1):
        d = S.smin(d, S.sd_capsule(P, (sx * 0.064, -0.08, 0.15), (sx * 0.064, -0.086, 0.045),
                                   0.041), 0.03)
        d = S.smin(d, S.sd_ellipsoid(P, (sx * 0.066, 0.12, 0.14), (0.058, 0.078, 0.068)), 0.03)
        d = S.smin(d, S.sd_capsule(P, (sx * 0.07, 0.13, 0.12), (sx * 0.07, 0.136, 0.045),
                                   0.043), 0.03)
    return d


def head(P):
    S = kit
    d = S.sd_ellipsoid(P, tuple(HEAD_C), (0.135, 0.118, 0.114))
    for sx in (1, -1):
        d = S.smin(d, S.sd_ellipsoid(P, (sx * 0.08, -0.205, 0.292), (0.07, 0.06, 0.054)), 0.03)
        d = S.smin(d, S.sd_round_cone(P, (sx * 0.074, -0.16, 0.415), (sx * 0.102, -0.14, 0.512),
                                      0.05, 0.013), 0.02)
    return d


def tail(M):
    pts, radii = lo.smooth_lock(
        [TAIL_ROOT - Vector((0, 0.03, 0.01)), (0, 0.25, 0.2), (0, 0.31, 0.27), (0, 0.325, 0.37),
         (0, 0.29, 0.445), (0, 0.24, 0.462)],
        [0.034, 0.033, 0.031, 0.03, 0.028, 0.024], samples=18)
    return kit.tube("Tail_Fur", [tuple(p) for p in pts], radii, M["fur"], ring=12)


def collar(M):
    """A ring around the neck, square to it (the neck runs forward and up into the head)."""
    axis = Vector((0, -0.065, 0.09)).normalized()
    across, up = Vector((1, 0, 0)), axis.cross(Vector((1, 0, 0))).normalized()
    ring = [NECK + across * 0.084 * math.cos(a) + up * 0.074 * math.sin(a)
            for a in (2 * math.pi * k / 24 for k in range(24))]
    kit.ring_tube("Collar", [tuple(p) for p in ring], 0.016, M["collar"], ring=7)


def face(M):
    for sx in (1, -1):
        lo.eye(f"Eye{sx}", (sx * 0.057, -0.27, 0.362), (sx * 0.18, -1, 0.12), M)
        # Just proud of the ear's front face (the ear cone's front is at y ≈ -0.188 here).
        lo.blob(f"InnerEar{sx}", (sx * 0.086, -0.184, 0.45), (0.024, 0.008, 0.038),
                M["pink"], (sx * 0.2, -1, 0.3), roll=sx * -14, u=12, v=8)
        lo.blob(f"Muzzle{sx}", (sx * 0.026, -0.279, 0.297), (0.04, 0.03, 0.034), M["light"],
                (sx * 0.3, -1, -0.1), u=14, v=8)
        for k, (dz, spread) in enumerate(((0.008, 0.0), (-0.004, -0.012), (-0.016, -0.024))):
            a = Vector((sx * 0.05, -0.292, 0.3 + dz))
            b = Vector((sx * 0.13, -0.27, 0.305 + dz + spread))
            kit.tube(f"Whisker{sx}{k}", [a, (a + b) / 2, b], 0.0026, M["whisker"], ring=5,
                     cap_rings=2)
    lo.blob("Nose", (0.0, -0.304, 0.322), (0.019, 0.011, 0.013), M["nose"], u=12, v=8)
    w = [(-0.026, -0.302, 0.292), (-0.013, -0.307, 0.283), (0.0, -0.304, 0.292),
         (0.013, -0.307, 0.283), (0.026, -0.302, 0.292)]
    kit.tube("Mouth", w, 0.0042, M["mouth"], ring=6, cap_rings=2)
    # Tabby stripes: flat patches sunk into the brow, so only a thin cap of colour shows.
    for k, x in enumerate((-0.032, 0.0, 0.032)):
        n = (Vector((x, -0.072 + abs(x) * 0.25, 0.1))).normalized()
        at = HEAD_C + Vector((x * 1.05, -0.068 + abs(x) * 0.25, 0.092))
        lo.blob(f"Stripe{k}", at, (0.0115, 0.006, 0.028), M["dark"], n, u=10, v=6)


def build():
    lib.begin(NAME)
    M = lo.pet_materials("#F4A259", "#FFF1DC", "#D9822B")
    M["whisker"] = lib.mat("Whisker", "#FFF8F0", rough=0.6)
    M["nose"] = lib.mat("CatNose", "#FF8FA3", rough=0.4)
    lo.sculpt("Body", body, (-0.2, -0.2, -0.01), (0.2, 0.25, 0.32), M["fur"], 1000)
    for sx in (1, -1):
        lo.blob(f"Paw{sx}F", (sx * 0.064, -0.094, 0.028), (0.046, 0.054, 0.029), M["light"],
                u=14, v=8)
        lo.blob(f"Paw{sx}B", (sx * 0.07, 0.122, 0.028), (0.048, 0.056, 0.029), M["light"],
                u=14, v=8)
    lo.blob("Chest", (0.0, -0.125, 0.18), (0.072, 0.045, 0.085), M["light"], u=16, v=8)
    collar(M)
    lo.blob("Bell", (0.0, -0.205, 0.205), (0.022, 0.022, 0.022), M["gold"], u=12, v=8)
    head_ob = lo.sculpt("Head_Fur", head, (-0.22, -0.32, 0.18), (0.22, -0.02, 0.56), M["fur"],
                        1100)
    face(M)
    for o in list(lib.coll().objects):
        if o is head_ob or o.name.startswith(("Eye", "InnerEar", "Muzzle", "Whisker", "Nose",
                                               "Mouth", "Stripe")):
            lib.node(o, "Head", pivot=tuple(NECK))
    t = tail(M)
    lib.node(t, "Tail", pivot=tuple(TAIL_ROOT))


def finalize(name):
    return kit.finalize(name, META, mount=None, lift=(0, 0, 0), ao_res=512, ao_distance=0.1)
