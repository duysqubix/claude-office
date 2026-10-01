"""Coffee truck: a chunky, friendly food truck. A mint `Accent` box body with a coffee-brown
stripe, a rounded cab with a smiley grille and big headlights, a serving hatch on its right
(+X) side under a striped scalloped awning with cups on the counter and a little menu board,
fat tyres, and a giant takeaway cup on the roof. It faces -Y. 4 m long, about 4 m tall to the
top of the steam. Origin at the ground centre."""
import math

import lib
from environment import _env

NAME = "coffee_truck"
AO_RES = 512
AO_DISTANCE = 0.3

W = 1.9
BOX_Y = 0.55          # box body centre along the truck
BOX_L = 2.6
FLOOR_Z = 0.5         # underside of the bodywork
BOX_TOP = 2.4
WHEEL_R = 0.38


def materials():
    return dict(
        body=lib.mat("Accent", _env.P["wallAccent"], rough=0.45),
        cream=lib.mat("Cream", "#FFF4E3", rough=0.5),
        stripe=lib.mat("Coffee", lib.P["coffee"], rough=0.55),
        orange=lib.mat("Awning", _env.P["claude"], rough=0.55),
        window=lib.mat("Window", "#34476A", rough=0.15),
        dark=lib.mat("Chassis", "#3B4252", rough=0.6),
        tyre=lib.mat("Tyre", "#2B2D42", rough=0.8),
        inside=lib.mat("Inside", "#4A3226", rough=0.8),
        wood=lib.mat("Counter", lib.P["wood"], rough=0.6),
        board=lib.mat("MenuBoard", "#2F4F43", rough=0.8),
        lamp=_env.glow("Headlight", "#FFF3C4", strength=0.8),
        steam=lib.mat("Steam", "#F4F8FB", rough=0.9),
    )


def bodywork(M):
    box_h = BOX_TOP - FLOOR_Z
    _env.rr_prism("Box", W, BOX_L, box_h, 0.32, (0, BOX_Y, FLOOR_Z + box_h / 2), M["body"],
                  seg=8, bevel=0.14, bseg=3)
    _env.rr_prism("RoofCap", W - 0.1, BOX_L - 0.1, 0.07, 0.28, (0, BOX_Y, BOX_TOP + 0.02),
                  M["cream"], seg=8, bevel=0.03, bseg=2)
    for z, h, m in ((1.02, 0.16, "stripe"), (1.16, 0.06, "cream")):
        _env.rr_prism(f"Stripe{z}", W + 0.025, BOX_L + 0.025, h, 0.33, (0, BOX_Y, z), M[m],
                      seg=8, bevel=0.02, bseg=2)
    cab_h = 1.45
    _env.rr_prism("Cab", W - 0.06, 1.3, cab_h, 0.38, (0, -1.2, FLOOR_Z + cab_h / 2), M["body"],
                  seg=8, bevel=0.2, bseg=3)
    lib.rbox("Windscreen", (W - 0.46, 0.07, 0.5), (0, -1.83, 1.5), M["window"], r=0.06, seg=2,
             rot=(math.radians(-12), 0, 0))
    for sx in (-1, 1):
        lib.rbox(f"CabWindow{sx}", (0.07, 0.62, 0.46), (sx * (W / 2 - 0.035), -1.18, 1.5),
                 M["window"], r=0.06, seg=2)
        lib.sphere(f"Mirror{sx}", 1.0, (sx * (W / 2 + 0.08), -1.62, 1.42), M["body"],
                   scale=(0.06, 0.04, 0.08), u=12, v=8)
    _env.rr_prism("Chassis", W - 0.14, 3.75, 0.3, 0.3, (0, -0.1, FLOOR_Z - 0.05), M["dark"],
                  seg=6, bevel=0.06, bseg=2)


def face(M):
    front = -1.85
    for sx in (-1, 1):
        lib.cyl(f"HeadlightRing{sx}", 0.15, 0.06, (sx * 0.58, front, 0.95), M["cream"],
                r=0.02, seg=2, verts=24, rot=(math.pi / 2, 0, 0))
        lib.sphere(f"Headlight{sx}", 0.115, (sx * 0.58, front - 0.03, 0.95), M["lamp"],
                   scale=(1, 0.45, 1), u=20, v=10)
    smile = [((k / 8) * 2 - 1, 0, 0) for k in range(9)]
    smile = [(t * 0.32, front - 0.01, 0.72 + 0.08 * t * t) for t, _, _ in smile]
    _env.sweep_tube("Grille", smile, 0.035, M["dark"], verts=10)
    for y in (-1.93, 1.9):
        lib.rbox(f"Bumper{y}", (W - 0.08, 0.16, 0.16), (0, y, 0.45), M["cream"], r=0.07, seg=3)


def hatch(M):
    x = W / 2
    lib.rbox("Hatch", (0.05, 1.5, 0.78), (x + 0.0, BOX_Y - 0.05, 1.62), M["inside"], r=0.05,
             seg=2)
    lib.rbox("Counter", (0.34, 1.62, 0.06), (x + 0.14, BOX_Y - 0.05, 1.22), M["wood"], r=0.025,
             seg=2)
    # Striped awning, tipped down and out, with a scalloped valance.
    stripes = 7
    sw = 1.72 / stripes
    tilt = math.radians(24)
    for i in range(stripes):
        y = BOX_Y - 0.05 - 0.86 + sw * (i + 0.5)
        m = M["orange"] if i % 2 == 0 else M["cream"]
        lib.rbox(f"Awning{i}", (0.62, sw + 0.004, 0.04), (x + 0.3, y, 2.13), m, r=0.015, seg=1,
                 rot=(0, tilt, 0))
        lib.cyl(f"Scallop{i}", sw / 2, 0.035, (x + 0.585, y, 1.98), m, r=0.01, seg=1, verts=16,
                rot=(0, math.pi / 2 - 0.0, 0))
    # Cups on the counter: cream cups with coffee sleeves.
    for k, dy in enumerate((-0.45, -0.25, 0.4)):
        c = (x + 0.16, BOX_Y + dy, 1.25)
        lib.lathe(f"Cup{k}", [(0.0, 0.0), (0.035, 0.0), (0.045, 0.11), (0.0, 0.11)], loc=c,
                  material=M["cream"], verts=14)
        lib.lathe(f"Sleeve{k}", [(0.039, 0.035), (0.044, 0.035), (0.047, 0.075),
                                 (0.042, 0.075)], loc=c, material=M["stripe"], verts=14)
    # Menu board beside the hatch, with chalky lines for the menu.
    lib.rbox("MenuFrame", (0.05, 0.5, 0.62), (x + 0.02, BOX_Y + 1.0, 1.55), M["wood"], r=0.02,
             seg=2)
    lib.rbox("MenuBoard", (0.03, 0.42, 0.54), (x + 0.04, BOX_Y + 1.0, 1.55), M["board"], r=0.01,
             seg=1)
    for k in range(4):
        lib.rbox(f"MenuLine{k}", (0.012, 0.3 - 0.05 * (k % 2), 0.03),
                 (x + 0.055, BOX_Y + 1.0 - 0.02 * (k % 2), 1.72 - k * 0.11), M["cream"],
                 r=0.006, seg=1)


def roof_cup(M):
    z0 = BOX_TOP + 0.05
    y = BOX_Y + 0.2
    lib.lathe("BigCup", [(0.0, 0.0), (0.3, 0.0), (0.33, 0.03), (0.42, 0.78), (0.0, 0.78)],
              loc=(0, y, z0), material=M["cream"], verts=32)
    lib.lathe("BigSleeve", [(0.345, 0.22), (0.37, 0.22), (0.4, 0.52), (0.375, 0.52)],
              loc=(0, y, z0), material=M["stripe"], verts=32)
    lid = [(0.0, 0.78), (0.45, 0.78), (0.46, 0.82), (0.43, 0.85), (0.38, 0.86), (0.36, 0.92),
           (0.3, 0.95), (0.0, 0.96)]
    lib.lathe("BigLid", lid, loc=(0, y, z0), material=M["orange"], verts=32)
    # Soft puffs of steam curling up out of the lid.
    for k, (dx, dz, r) in enumerate(((0.0, 1.07, 0.11), (0.1, 1.27, 0.085), (0.02, 1.44, 0.065),
                                     (-0.08, 1.58, 0.045))):
        lib.sphere(f"Steam{k}", r, (dx, y, z0 + dz), M["steam"], u=14, v=8)


def wheels(M):
    for sx in (-1, 1):
        for y in (-1.25, 1.15):
            c = (sx * (W / 2 - 0.13), y, WHEEL_R)
            prof = [(0.0, -0.15), (0.24, -0.15), (0.32, -0.14), (WHEEL_R, -0.08),
                    (WHEEL_R + 0.005, 0.0), (WHEEL_R, 0.08), (0.32, 0.14), (0.24, 0.15),
                    (0.0, 0.15)]
            lib.lathe(f"Tyre{sx}{y}", prof, loc=c, material=M["tyre"], verts=24,
                      rot=(0, math.pi / 2, 0))
            lib.cyl(f"Hubcap{sx}{y}", 0.19, 0.05, (c[0] + sx * 0.14, c[1], c[2]), M["cream"],
                    r=0.02, seg=2, verts=20, rot=(0, math.pi / 2, 0))


def build():
    lib.begin(NAME)
    M = materials()
    bodywork(M)
    face(M)
    hatch(M)
    roof_cup(M)
    wheels(M)


META = dict(
    name="Coffee truck",
    category="outdoor",
    priority="P2",
    description=("Chunky mint food truck with a smiley cab, a serving hatch under a striped "
                 "scalloped awning, cups on the counter and a giant takeaway cup on the roof"),
    tags=["vehicle", "coffee", "food", "garden", "event"],
    tintable=["Accent"],
    anchors={"counter": [1.09, 1.25, -0.5], "customer": [1.9, 0, -0.5]},
    notes="Body is 'Accent' (default mint #8FE0C8). Faces +Z; the hatch opens on +X.",
)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META)
