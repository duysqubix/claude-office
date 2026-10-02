"""Water bottle: chunky reusable sports bottle. Tintable `Accent` body with a soft white grip
band at the waist, "H2O" and drink-up tick marks printed on the front, white screw cap with
a dark flip spout and a carry loop. 0.24 m tall; origin at the desk-contact centre."""
import math

import lib
from decor import _decor as D
from decor import _food as F

NAME = "water_bottle"
AO_RES = 256
AO_DISTANCE = 0.04
R = 0.037
META = dict(
    name="Water bottle", category="food", priority="P1",
    description="Chunky sports water bottle with a grip band, flip spout and carry loop",
    tags=["drink", "desk", "hydration", "clutter"], tintable=["Accent"],
    anchors_bl={"spout": (0, 0, 0.238), "loop": (0, 0.028, 0.232)},
)
BODY = [(0.0, 0.0), (0.03, 0.0), (0.0345, 0.003), (0.0366, 0.011), (R, 0.022), (R, 0.074),
        (0.0348, 0.092), (0.0342, 0.105), (0.0348, 0.118), (R, 0.134), (R, 0.172),
        (0.0345, 0.184), (0.029, 0.1915), (0.0242, 0.1955), (0.0238, 0.199), (0.0, 0.199)]


def materials():
    return dict(
        body=D.mat("Accent", "sky", rough=0.35),
        white=D.mat("White", "white", rough=0.5),
        spout=D.mat("Spout", "rubber", rough=0.5),
    )


def bottle(M):
    body = D.lathe("Body", BODY, M["body"], verts=36)
    D.paint(body, M["white"], lambda c, n: 0.088 < c.z < 0.122)


def cap(M):
    D.lathe("Cap", [(0.0, 0.196), (0.0262, 0.196), (0.0286, 0.1985), (0.0291, 0.2045),
                    (0.0291, 0.2135), (0.0276, 0.219), (0.0225, 0.2218), (0.0, 0.2222)],
            M["white"], verts=32, sharp=60)
    for i in range(12):
        a = 2 * math.pi * i / 12
        lib.rbox(f"Cap_Rib{i}", (0.0026, 0.0032, 0.0105),
                 (0.0294 * math.cos(a), 0.0294 * math.sin(a), 0.2085), M["white"], r=0,
                 rot=(0, 0, a))
    lib.cyl("Spout", 0.0092, 0.012, (0, -0.004, 0.2265), M["spout"], r=0.004, seg=2, verts=18)
    lib.cyl("Spout_Base", 0.013, 0.004, (0, -0.004, 0.2225), M["white"], r=0.0017, seg=1,
            verts=20)
    lib.torus("Loop", 0.0135, 0.0036, (0, 0.021, 0.2275), M["white"], seg=18, ring=8,
              rot=(0, math.pi / 2, 0))


def prints(M):
    r = R + 0.0005
    # Small enough to stay within about ±23° of the front (no letter past the silhouette).
    t = D.text("Print_H2O", "H2O", 0.0165, M["white"], loc=(0, -r, 0.153), depth=0, res=2)
    F.wrap_decal(t, r, 0.153, max_edge=0.003)
    for i, (w, z) in enumerate(((0.016, 0.068), (0.011, 0.054), (0.016, 0.04), (0.011, 0.026))):
        tick = D.face(f"Print_Tick{i}", D.rrect_pts(w, 0.0034, 0.0017, steps=2), M["white"],
                      loc=(-0.012 + w / 2, -r, z), rot=D.FRONT)
        F.wrap_decal(tick, r, z)


def build():
    lib.begin(NAME)
    M = materials()
    bottle(M)
    cap(M)
    prints(M)


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META)
