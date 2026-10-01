"""Birthday cake: a two-tier round cake on a cake stand. Pink frosting with soft drips over
the edge, cream piped dollops, sprinkles, and five striped candles with glowing flames.
Origin at the bottom centre of the stand (sits on a table)."""
import math
import random

import lib

NAME = "birthday_cake"
AO_RES = 256
META = dict(
    name="Birthday cake", category="food", priority="P2", artist="Claude Monet",
    description="Two-tier birthday cake with drippy frosting and lit candles",
    tags=["party", "event", "food", "celebration"], tintable=["Accent"],
    anchors_bl={"flames": (0, 0, 0.38)},
)


def materials():
    return dict(
        stand=lib.mat("Stand", "#FFFFFF", rough=0.35),
        sponge=lib.mat("Sponge", "#F2D3A2", rough=0.7),
        icing=lib.mat("Accent", "#FF9DCB", rough=0.45),
        cream=lib.mat("Cream", "#FFF6E8", rough=0.6),
        candle=lib.mat("Candle", "#4D96FF", rough=0.5),
        flame=lib.mat("Flame", "#FFD27A", rough=0.3, emit="#FFB347", strength=3.0),
        sprinkles=[lib.mat(f"Sprinkle{i}", c, rough=0.4) for i, c in
                   enumerate(("#FFD93D", "#6BCB77", "#4D96FF", "#FF5A5F"))],
    )


def tier(M, name, r, z0, h, drips=10):
    lib.cyl(f"{name}_Sponge", r - 0.004, h - 0.01, (0, 0, z0 + (h - 0.01) / 2), M["sponge"],
            r=0.006, seg=1, verts=24)
    prof = [(0.0, z0 + h + 0.012), (r - 0.02, z0 + h + 0.012), (r + 0.006, z0 + h - 0.002),
            (r + 0.008, z0 + h - 0.03), (r + 0.004, z0 + h - 0.045), (r - 0.01, z0 + h - 0.045)]
    ob = lib.lathe(f"{name}_Icing", prof, material=M["icing"], verts=28)
    for v in ob.data.vertices:                      # wavy drips over the edge
        rr = math.hypot(v.co.x, v.co.y)
        if rr > r - 0.012 and v.co.z < z0 + h - 0.02:
            a = math.atan2(v.co.y, v.co.x)
            v.co.z -= 0.035 * max(0.0, math.cos(a * drips)) ** 3
    lib.subsurf(ob, 1)
    for k in range(10):
        a = 2 * math.pi * k / 10
        lib.sphere(f"{name}_Dollop{k}", 0.014, (math.cos(a) * (r - 0.015),
                   math.sin(a) * (r - 0.015), z0 + h + 0.018), M["cream"], scale=(1, 1, 0.8),
                   u=6, v=4)


def parts(M):
    lib.cyl("BK_Plate", 0.19, 0.016, (0, 0, 0.072), M["stand"], r=0.006, seg=1, verts=28)
    lib.cyl("BK_Foot", 0.07, 0.02, (0, 0, 0.01), M["stand"], r=0.008, seg=1, verts=24)
    lib.cyl("BK_Stem", 0.025, 0.06, (0, 0, 0.05), M["stand"], radius2=0.035, r=0.006, seg=1,
            verts=16)
    tier(M, "BK_Low", 0.16, 0.08, 0.11, drips=11)
    tier(M, "BK_Top", 0.105, 0.19, 0.09, drips=8)
    rnd = random.Random(2)
    for k in range(14):
        a, rr = rnd.uniform(0, 2 * math.pi), rnd.uniform(0.0, 0.085)
        lib.rbox(f"BK_Sprinkle{k}", (0.012, 0.004, 0.004), (math.cos(a) * rr, math.sin(a) * rr,
                 0.293), M["sprinkles"][k % 4], r=0.0015, seg=1, rot=(0, 0, rnd.uniform(0, 3)))
    for k in range(5):
        a = 2 * math.pi * k / 5 + 0.3
        x, y = math.cos(a) * 0.055, math.sin(a) * 0.055
        lib.cyl(f"BK_Candle{k}", 0.008, 0.07, (x, y, 0.325), M["candle"], r=0.002, seg=1,
                verts=10)
        lib.sphere(f"BK_Flame{k}", 0.011, (x, y, 0.372), M["flame"], scale=(0.8, 0.8, 1.5),
                   u=10, v=6)


def build():
    lib.begin(NAME)
    parts(materials())


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
