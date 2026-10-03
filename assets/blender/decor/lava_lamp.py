"""Lava lamp: the classic rocket silhouette, left empty so the game can pour in its own moving
wax (#43). Named nodes, each pivoted at its own base centre: `Base` (tintable `Accent` cone),
`Glass` (the translucent glowing bottle, glTF alpha BLEND) and `Cap`; the gold collar the
bottle sits in is the asset root. The `glass_*` anchors trace the inside up to the cap: floor
and top on the axis, then the wall on +X from bottom to top (x = the radius there). Only the
catalog thumbnail shows wax. 0.34 m tall; origin at the desk-contact centre."""
import lib
from decor import _decor as D

NAME = "lava_lamp"
AO_RES = 256
AO_DISTANCE = 0.05
# Open at the bottom: the base's top is the floor of the glass (a glass bottom lying on it
# would shade it black).
GLASS = [(0.034, 0.112), (0.04, 0.13), (0.0455, 0.165), (0.046, 0.185), (0.042, 0.22),
         (0.034, 0.26), (0.026, 0.29), (0.0235, 0.298), (0.0, 0.298)]
CAP_Z = 0.296  # the cap sits over the bottle's top from here up


def inside():
    """Anchors (Blender coords) for the inside of the glass, up to the cap."""
    wall = [p for p in GLASS if p[0] > 0 and p[1] < CAP_Z]
    (ra, za), (rb, zb) = wall[-1], next(p for p in GLASS if p[0] > 0 and p[1] >= CAP_Z)
    wall.append((ra + (rb - ra) * (CAP_Z - za) / (zb - za), CAP_Z))
    a = {"glass_bottom": (0, 0, GLASS[0][1]), "glass_top": (0, 0, CAP_Z)}
    a.update({f"glass_wall_{i}": (r, 0, z) for i, (r, z) in enumerate(wall)})
    return a


META = dict(
    name="Lava lamp", category="decor", priority="P1",
    description="Groovy lava lamp: a translucent glowing bottle the game fills with moving wax",
    tags=["desk", "lamp", "glow", "retro"], tintable=["Accent"],
    anchors_bl={"glow": (0, 0, 0.2), **inside()},
    transparent=["Glass"],
)


def materials():
    return dict(
        shell=D.mat("Accent", "purple", rough=0.35, metal=0.15),
        glass=lib.mat("Glass", "#E9A6FF", rough=0.12, emit="#C96BFF", strength=0.55, alpha=0.42),
        trim=D.mat("Trim", "gold", rough=0.3, metal=0.35),
    )


def build():
    lib.begin(NAME)
    M = materials()
    base = D.lathe("BaseShell", [(0.0, 0.0), (0.062, 0.0), (0.0655, 0.004), (0.064, 0.012),
                                 (0.0395, 0.104), (0.0365, 0.112), (0.0, 0.112)], M["shell"],
                   verts=32, sharp=50)
    lib.node(base, "Base", pivot=(0, 0, 0))
    lib.node(D.lathe("Bottle", GLASS, M["glass"], verts=32), "Glass", pivot=(0, 0, GLASS[0][1]))
    cap = D.lathe("CapShell", [(0.0, CAP_Z), (0.025, CAP_Z), (0.0255, 0.302), (0.0175, 0.336),
                               (0.015, 0.34), (0.0, 0.341)], M["shell"], verts=28, sharp=50)
    lib.node(cap, "Cap", pivot=(0, 0, CAP_Z))
    lib.torus("Collar", 0.0368, 0.0035, (0, 0, 0.111), M["trim"], seg=28, ring=6)


def wax():
    """Preview-only wax: a pool on the bottom, a blob pulling away from it, one rising, one
    near the top."""
    m = lib.mat("Wax", "#FF8A3D", rough=0.4, emit="#FF7A2E", strength=1.6)
    lib.sphere("Wax_Pool", 0.03, (0, 0, 0.127), m, scale=(1.18, 1.18, 0.5), u=20, v=10)
    lib.sphere("Wax_Neck", 0.014, (0.004, 0.0, 0.142), m, scale=(1, 1, 1.4), u=14, v=8)
    lib.sphere("Wax_Rise", 0.0175, (-0.008, 0.004, 0.19), m, scale=(1.0, 1.0, 1.25), u=16, v=10)
    lib.sphere("Wax_Top", 0.0135, (0.006, -0.003, 0.245), m, scale=(1.05, 1.0, 0.9), u=14, v=8)
    lib.sphere("Wax_Drop", 0.007, (-0.006, 0.004, 0.272), m, u=10, v=6)


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META, preview=wax)
