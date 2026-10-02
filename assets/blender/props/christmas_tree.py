"""Christmas tree (seasonal): four soft stacked green tiers with scalloped hems, a glowing gold
star on top, shiny baubles, a candy garland, a red wrapped pot and two presents with ribbons.
Origin at the floor centre."""
import math
import random

import lib

NAME = "christmas_tree"
AO_RES = 512
TIERS = [(0.62, 0.5, 0.46), (0.5, 0.82, 0.4), (0.38, 1.1, 0.36), (0.25, 1.36, 0.3)]
META = dict(
    name="Christmas tree", category="plant", priority="P2",
    description="Chunky festive tree with star, baubles and presents",
    tags=["seasonal", "decor", "holiday"], tintable=[],
    anchors_bl={"star": (0, 0, 1.78)},
)


def materials():
    return dict(
        needles=lib.mat("Needles", "#2E9E5B", rough=0.7),
        needles2=lib.mat("NeedlesLight", "#46B35A", rough=0.7),
        pot=lib.mat("Pot", "#E63946", rough=0.5),
        gold=lib.mat("Star", "#FFD93D", rough=0.3, emit="#FFD93D", strength=1.6),
        trunk=lib.mat("Trunk", lib.P["treeTrunk"] if "treeTrunk" in lib.P else "#9C6B43",
                      rough=0.7),
        baubles=[lib.mat(f"Bauble{i}", c, rough=0.2, metal=0.3) for i, c in
                 enumerate(("#FF5A5F", "#4D96FF", "#FFD93D", "#B983FF", "#FFFFFF"))],
        garland=lib.mat("Garland", "#FFFFFF", rough=0.5),
        giftA=lib.mat("GiftA", "#4D96FF", rough=0.5),
        giftB=lib.mat("GiftB", "#6BCB77", rough=0.5),
        ribbon=lib.mat("Ribbon", "#FF5A5F", rough=0.45),
    )


def base(M):
    prof = [(0.0, 0.0), (0.17, 0.0), (0.2, 0.03), (0.22, 0.22), (0.24, 0.25), (0.24, 0.28),
            (0.0, 0.28)]
    lib.lathe("CTr_Pot", prof, material=M["pot"], verts=24)
    lib.cyl("CTr_Trunk", 0.06, 0.3, (0, 0, 0.38), M["trunk"], r=0.01, seg=1, verts=12)


def tiers(M):
    for i, (r, z, h) in enumerate(TIERS):
        # Cone with a soft scalloped hem: radius ripples around the bottom ring.
        prof = [(0.0, z + h), (r * 0.25, z + h * 0.8), (r * 0.7, z + h * 0.32), (r, z + 0.04),
                (r * 0.92, z), (0.0, z + 0.02)]
        t = lib.lathe(f"CTr_Tier{i}", prof, material=M["needles" if i % 2 == 0 else "needles2"],
                      verts=24)
        for v in t.data.vertices:
            rr = math.hypot(v.co.x, v.co.y)
            if rr > r * 0.6:
                a = math.atan2(v.co.y, v.co.x)
                k = 1.0 + 0.08 * math.cos(a * 8)
                v.co.x *= k
                v.co.y *= k
        lib.subsurf(t, 1)


def decorations(M):
    rnd = random.Random(4)
    for i, (r, z, h) in enumerate(TIERS):
        n = 7 - i
        for k in range(n):
            a = 2 * math.pi * (k + rnd.random() * 0.4) / n + i
            rr = r * 0.88
            lib.sphere(f"CTr_Bauble{i}_{k}", 0.04 if i < 2 else 0.032,
                       (rr * math.cos(a), rr * math.sin(a), z + 0.02), M["baubles"][(k + i) % 5],
                       u=12, v=6)
        lib.torus(f"CTr_Garland{i}", r * 0.62, 0.012, (0, 0, z + h * 0.45), M["garland"],
                  seg=24, ring=6, rot=(math.radians(8), math.radians(-6), 0))
    pts = []
    for k in range(10):
        a = math.pi / 2 + k * math.pi / 5
        rr = 0.12 if k % 2 == 0 else 0.05
        pts.append((rr * math.cos(a), rr * math.sin(a)))
    lib.slab("CTr_Star", pts, -0.025, 0.025, (0, 0, 1.76), M["gold"], r=0.012, seg=1,
             rot=(math.pi / 2, 0, 0))


def presents(M):
    for i, (x, y, s, mat) in enumerate(((0.38, -0.25, 0.22, M["giftA"]),
                                        (-0.36, -0.3, 0.17, M["giftB"]))):
        lib.rbox(f"CTr_Gift{i}", (s, s, s * 0.85), (x, y, s * 0.425), mat, r=0.02, seg=2,
                 rot=(0, 0, 0.3 * (i * 2 - 1)))
        for k in range(2):
            lib.rbox(f"CTr_Ribbon{i}_{k}", (s + 0.006 if k == 0 else 0.035,
                     0.035 if k == 0 else s + 0.006, s * 0.85 + 0.006), (x, y, s * 0.425),
                     M["ribbon"], r=0.008, seg=1, rot=(0, 0, 0.3 * (i * 2 - 1)))
        lib.torus(f"CTr_Bow{i}", 0.035, 0.012, (x, y, s * 0.85 + 0.02), M["ribbon"], seg=12,
                  ring=6, rot=(math.pi / 2, 0, 0.3 * (i * 2 - 1)))


STEPS = [base, tiers, decorations, presents]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
