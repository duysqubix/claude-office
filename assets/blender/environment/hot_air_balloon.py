"""Hot air balloon: sky decor. A plump teardrop envelope of puffy gores in Claude orange,
cream and sunny yellow, cords down to a woven basket with sandbags, and a glowing burner.
About 8 m tall. Origin at the bottom centre of the basket."""
import math

import lib
from environment import _env

NAME = "hot_air_balloon"
AO_RES = 512
AO_DISTANCE = 0.5

GORES = 16
MOUTH_Z = 2.05
MOUTH_R = 0.45
BASKET = 0.95


def materials():
    return dict(
        gores=[lib.mat("GoreOrange", _env.P["claude"], rough=0.6),
               lib.mat("GoreCream", "#FFF4E3", rough=0.6),
               lib.mat("GoreYellow", "#FFC93C", rough=0.6),
               lib.mat("GoreCream2", "#FFF4E3", rough=0.6)],
        mouth=lib.mat("Mouth", "#5A3A2E", rough=0.8),
        wicker=lib.mat("Wicker", "#C99A5B", rough=0.85),
        rim=lib.mat("BasketRim", "#8E5A33", rough=0.8),
        cord=lib.mat("Cord", "#EDE3D0", rough=0.9),
        sand=lib.mat("Sandbag", "#D9C08A", rough=0.9),
        metal=lib.mat("Burner", lib.P["metal"], rough=0.4, metal=0.4),
        flame=_env.glow("Flame", "#FFB020", strength=3.0),
    )


def envelope(M):
    prof = [(0.0, MOUTH_Z + 0.25), (MOUTH_R * 0.7, MOUTH_Z + 0.02), (MOUTH_R, MOUTH_Z),
            (0.85, MOUTH_Z + 0.6), (1.55, MOUTH_Z + 1.45), (2.0, MOUTH_Z + 2.5),
            (2.2, MOUTH_Z + 3.4), (2.12, MOUTH_Z + 4.2), (1.8, MOUTH_Z + 4.9),
            (1.2, MOUTH_Z + 5.45), (0.55, MOUTH_Z + 5.75), (0.0, MOUTH_Z + 5.82)]
    ob = lib.lathe("Envelope", prof, material=M["gores"][0], verts=GORES * 4)
    me = ob.data
    for m in M["gores"][1:] + [M["mouth"]]:
        me.materials.append(m)
    # Puffy gores: each panel bulges a little between its seams.
    for v in me.vertices:
        rr = math.hypot(v.co.x, v.co.y)
        if rr > 1e-5 and v.co.z > MOUTH_Z + 0.05:
            a = math.atan2(v.co.y, v.co.x)
            k = 1 + 0.035 * abs(math.sin(GORES / 2 * a))
            v.co.x, v.co.y = v.co.x * k, v.co.y * k
    for p in me.polygons:
        c = p.center
        if c.z < MOUTH_Z + 0.03 and math.hypot(c.x, c.y) < MOUTH_R:
            p.material_index = 4  # the dark mouth opening
            continue
        a = (math.atan2(c.y, c.x) + 2 * math.pi) % (2 * math.pi)
        p.material_index = int(a / (2 * math.pi / GORES)) % 4
    lib.torus("MouthRing", MOUTH_R, 0.03, (0, 0, MOUTH_Z), M["rim"], seg=24, ring=6)


def basket(M):
    _env.rr_prism("Basket", 1.0, 1.0, BASKET, 0.16, (0, 0, BASKET / 2), M["wicker"], seg=4,
                  bevel=0.04, bseg=2)
    _env.rr_ring("BasketRim", (1.08, 1.08, 0.2), (0.9, 0.9, 0.12), 0.09, (0, 0, BASKET),
                 M["rim"], seg=4, bevel=0.03, bseg=2, rot=(math.pi / 2, 0, 0))
    for z in (0.3, 0.6):
        _env.rr_ring(f"Weave{z}", (1.03, 1.03, 0.18), (0.98, 0.98, 0.15), 0.05, (0, 0, z),
                     M["rim"], seg=4, bevel=0.012, bseg=1, rot=(math.pi / 2, 0, 0))
    for sx, sy in ((1, -1), (-1, 1)):
        lib.sphere(f"Sandbag{sx}", 1.0, (sx * 0.56, sy * 0.2, 0.62), M["sand"],
                   scale=(0.09, 0.12, 0.15), u=12, v=8)


def rigging(M):
    for k in range(8):
        a = 2 * math.pi * k / 8 + math.pi / 8
        top = (MOUTH_R * math.cos(a), MOUTH_R * math.sin(a), MOUTH_Z)
        cx = 0.46 * (1 if math.cos(a) > 0 else -1)
        cy = 0.46 * (1 if math.sin(a) > 0 else -1)
        _env.sweep_tube(f"Cord{k}", [top, (cx, cy, BASKET + 0.02)], 0.012, M["cord"], verts=5)
    lib.cyl("BurnerFrame", 0.16, 0.12, (0, 0, MOUTH_Z - 0.32), M["metal"], r=0.02, seg=1,
            verts=16)
    lib.sphere("Flame", 0.12, (0, 0, MOUTH_Z - 0.16), M["flame"], scale=(1, 1, 1.5), u=14, v=8)


def build():
    lib.begin(NAME)
    M = materials()
    envelope(M)
    basket(M)
    rigging(M)


META = dict(
    name="Hot air balloon",
    category="outdoor",
    priority="P2",
    description=("Plump teardrop balloon of puffy orange, cream and yellow gores over a woven "
                 "basket with sandbags and a glowing burner"),
    tags=["sky", "decor", "balloon", "event"],
    tintable=[],
    anchors={"basket": [0, 0.95, 0], "burner": [0, 1.89, 0]},
    notes="Sky decor: origin at the basket bottom. About 8 m tall; bob it slowly.",
)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META, ground=None, preview_lift=0.6)
