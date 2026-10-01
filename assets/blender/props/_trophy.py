"""Shared builder for trophy_bronze / trophy_silver / trophy_gold: a chunky cup with loop
handles on a stem, a stepped wooden base with a plaque, and (gold only) a star on top.
Origin at the bottom centre; the plaque faces -Y."""
import math

import lib

TIERS = {
    "bronze": dict(metal="#CD7F50", scale=0.8, star=False, plaque="#E8BE84"),
    "silver": dict(metal="#D5DCE6", scale=0.9, star=False, plaque="#E8BE84"),
    "gold": dict(metal="#F2C14E", scale=1.0, star=True, plaque="#FFF3DE"),
}


def meta(tier):
    t = TIERS[tier]
    return dict(
        name=f"{tier.title()} trophy", category="decor", priority="P1",
        description=f"Chunky {tier} trophy, an achievement reward for the in-game economy",
        tags=["reward", "shop", "achievement", "desk"], tintable=[],
        anchors_bl={"top": (0, 0, 0.42 * t["scale"])}, tier=tier,
    )


def build(name, tier):
    t = TIERS[tier]
    k = t["scale"]
    lib.begin(name)
    metal = lib.mat("Metal", t["metal"], rough=0.25, metal=0.5)
    wood = lib.mat("Base", "#5B4636", rough=0.55)
    plaque = lib.mat("Plaque", t["plaque"], rough=0.35, metal=0.3)
    lib.rbox("TR_Base", (0.16 * k, 0.16 * k, 0.06 * k), (0, 0, 0.03 * k), wood, r=0.012 * k,
             seg=2)
    lib.rbox("TR_Base2", (0.12 * k, 0.12 * k, 0.035 * k), (0, 0, 0.0775 * k), wood,
             r=0.01 * k, seg=2)
    lib.rbox("TR_Plaque", (0.09 * k, 0.006, 0.03 * k), (0, -0.08 * k - 0.002, 0.03 * k), plaque,
             r=0.003, seg=1)
    prof = [(0.0, 0.095), (0.035, 0.095), (0.03, 0.11), (0.012, 0.13), (0.012, 0.17),
            (0.03, 0.19), (0.07, 0.24), (0.085, 0.31), (0.088, 0.35), (0.08, 0.355),
            (0.072, 0.34), (0.0, 0.33)]
    lib.lathe("TR_Cup", [(r * k, z * k) for r, z in prof], material=metal, verts=28)
    for s in (-1, 1):
        lib.torus(f"TR_Handle{s}", 0.035 * k, 0.009 * k, (s * 0.085 * k, 0, 0.29 * k), metal,
                  seg=12, ring=8, sweep=math.pi,
                  rot=(math.pi / 2, s * math.pi / 2, 0))   # loop bulges out sideways
    if t["star"]:
        pts = []
        for i in range(10):
            a = math.pi / 2 + i * math.pi / 5
            rr = 0.05 if i % 2 == 0 else 0.022
            pts.append((rr * math.cos(a) * k, rr * math.sin(a) * k))
        # Star stands upright facing -Y on top of the cup.
        lib.slab("TR_Star", pts, -0.012 * k, 0.012 * k, (0, 0, 0.41 * k), metal, r=0.006,
                 seg=1, rot=(math.pi / 2, 0, 0))
        lib.cyl("TR_StarPost", 0.008 * k, 0.04 * k, (0, 0, 0.355 * k), metal, r=0, verts=8)
