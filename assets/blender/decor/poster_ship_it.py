"""Poster: "SHIP IT". A sunny yellow poster in a fat round tintable `Accent` frame, with a
raised-relief rocket blasting off up and to the right (cream body, red nose and fins,
porthole, two-tone flame, launch puffs, twinkly stars) over big raised rounded "SHIP IT".
0.71 × 0.99 m; wall item: origin at the back centre, face looks -Y."""
import math

import lib
from decor import _decor as D
from decor import _wall as wallkit

NAME = "poster_ship_it"
AO_RES = 512
AO_DISTANCE = 0.05
W, H = 0.66, 0.94
META = dict(
    name="Poster: SHIP IT", category="decor", priority="P1",
    description="Framed yellow poster with a raised rocket and big \"SHIP IT\" lettering",
    tags=["wall", "poster", "joke"], tintable=["Accent"],
    anchors_bl={"center": (0, -0.03, 0)}, mount="wall: origin is the back centre",
    notes="Fixed by flicker: the cloud puffs are 2.5 mm flatter, so the rocket's flame sits in "
          "front of them instead of sharing a plane with one and flickering.",
)


def materials():
    return dict(
        board=D.mat("Poster", "yellow", rough=0.7),
        frame=D.mat("Accent", "ink", rough=0.5),
        ink=D.mat("Ink", "ink", rough=0.6),
        cream=D.mat("Cream", "paper", rough=0.55),
        red=D.mat("Red", "red", rough=0.5),
        sky=D.mat("Porthole", "sky", rough=0.35),
        chrome=D.mat("Chrome", "chrome", rough=0.3, metal=0.35),
        flame=D.mat("Flame", "orange", rough=0.5),
        flameIn=D.mat("FlameCore", "#FFE680", rough=0.5),
    )


def rocket(M, face):
    """Built pointing along +X in the board plane, then tilted into place."""
    before = D.snapshot()
    a, b, cu = 0.2, 0.082, 0.02
    body = [(cu + a * math.cos(t), b * math.sin(t)) for t in
            [2 * math.pi * k / 40 for k in range(40)]]
    body = [(max(u, -0.15), v) for u, v in body]
    D.prism("Rk_Body", D._dedupe(body), 0.016, M["cream"], loc=(0, face, 0), rot=D.FRONT,
            r=0.006, seg=2)
    # The nose is the ellipse's tip ahead of u = 0.115, 2 mm proud of the body so their
    # side walls don't z-fight.
    na, nb = a + 0.002, b + 0.002
    t0 = math.acos((0.115 - cu) / na)
    nose = [(cu + na * math.cos(t), nb * math.sin(t)) for t in
            [-t0 + 2 * t0 * k / 14 for k in range(15)]]
    D.prism("Rk_Nose", nose, 0.019, M["red"], loc=(0, face, 0), rot=D.FRONT, r=0.006, seg=2)
    for s in (-1, 1):
        fin = D.rounded_pts([(-0.06, s * 0.07), (-0.2, s * 0.15), (-0.165, s * 0.035)], 0.018,
                            steps=3)
        D.prism(f"Rk_Fin{s}", fin, 0.012, M["red"], loc=(0, face, 0), rot=D.FRONT, r=0.004)
    D.prism("Rk_WindowRim", D.circle_pts(0.046, 28), 0.021, M["chrome"],
            loc=(0.03, face, 0), rot=D.FRONT, r=0.005, seg=2)
    D.prism("Rk_Window", D.circle_pts(0.033, 24), 0.023, M["sky"], loc=(0.03, face, 0),
            rot=D.FRONT, r=0.004, seg=2)
    # Flame: a teardrop trailing well behind the tail, with a hot core.
    def teardrop(length, width, n):
        pts = []
        for k in range(n):
            t = 2 * math.pi * k / n
            pts.append((-0.135 - length * (1 - math.cos(t)) / 2,
                        width * math.sin(t) * (0.35 + 0.65 * (1 + math.cos(t)) / 2)))
        return D._dedupe(pts)
    D.prism("Rk_Flame", teardrop(0.2, 0.07, 26), 0.01, M["flame"], loc=(0, face, 0),
            rot=D.FRONT, r=0.004, seg=1)
    D.prism("Rk_FlameCore", teardrop(0.12, 0.04, 22), 0.013, M["flameIn"], loc=(0, face, 0),
            rot=D.FRONT, r=0.004, seg=1)
    D.place(D.since(before), loc=(0.02, 0, 0.1), rot=(0, -math.radians(52), 0))


def sky(M, face):
    for k, (x, z, r) in enumerate(((-0.21, 0.36, 0.03), (0.22, 0.38, 0.022), (-0.24, 0.1, 0.018),
                                   (0.25, 0.02, 0.02), (-0.06, 0.4, 0.014))):
        D.prism(f"Star{k}", D.rounded_pts(D.star_pts(4, r, r * 0.35), r * 0.12, steps=2), 0.006,
                M["cream"], loc=(x, face, z), rot=D.FRONT)
    # The two puffs the flame (10 mm) trails across sit at least 2.5 mm under it: level with
    # it, cream and orange shared a plane and flickered.
    for k, (x, z, r) in enumerate(((-0.215, -0.14, 0.05), (-0.145, -0.165, 0.04),
                                   (-0.265, -0.18, 0.035), (-0.08, -0.18, 0.03))):
        D.prism(f"Puff{k}", D.circle_pts(r, 18), 0.0065 + k * 0.001, M["cream"],
                loc=(x, face, z), rot=D.FRONT, r=0.004, seg=1)


def lettering(M, face):
    D.text("Ship_It", "SHIP IT", 0.15, M["ink"], loc=(0, face, -0.335), depth=0.01, res=2)


def build():
    lib.begin(NAME)
    M = materials()
    face = wallkit.framed("Poster", W, H, M["board"], M["frame"])
    sky(M, face)
    rocket(M, face)
    lettering(M, face)


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META, wall=True)
