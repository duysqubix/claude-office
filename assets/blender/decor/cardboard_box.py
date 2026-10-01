"""Cardboard box: the "you're let go" box. An open kraft box (side and back flaps flopped
outward, the front flap hanging down with "MY STUFF" scrawled on it in marker, a frowny
doodle under it, a red FRAGILE stamp on the side), packed with a wilting desk plant that
has dropped a yellow leaf, the red stapler sticking out, a framed photo, a rolled-up
poster and the rubber duck peeking over the rim. 0.4 × 0.3 × 0.26 m box; origin at the
floor-contact centre; the label faces -Y."""
import math

from mathutils import Matrix, Vector

import lib
from decor import _decor as D
from decor import rubber_duck, stapler

NAME = "cardboard_box"
AO_RES = 512
AO_DISTANCE = 0.07
W, DP, H, T = 0.40, 0.30, 0.26, 0.012
FLAP = 0.006
META = dict(
    name="Cardboard box", category="decor", priority="P0",
    description="Open moving box of desk stuff for someone being let go: wilting plant, red "
                "stapler, photo, poster roll and the duck peeking out",
    tags=["let-go", "carry", "funny"], tintable=[],
    anchors_bl={"handL": (-W / 2, 0, H - 0.05), "handR": (W / 2, 0, H - 0.05),
                "top": (0, 0, H)},
)


def materials():
    """Shared by colour so the box stays at a modest number of draw calls."""
    ink = D.mat("Ink", "ink", rough=0.55)
    paper = D.mat("Paper", "paper", rough=0.7)
    yellow = D.mat("Yellow", "duck", rough=0.4)
    red = D.mat("Red", "red", rough=0.45)
    pink = D.mat("Pink", "#FF8FB1", rough=0.6)
    return dict(
        kraft=D.mat("Cardboard", "kraft", rough=0.85),
        flap=D.mat("CardboardLight", "#E6B47C", rough=0.85),
        brown=D.mat("Brown", "#7A5232", rough=0.75),
        ink=ink, red=red, paper=paper, yellow=yellow, pink=pink,
        pot=D.mat("Pot", "pot", rough=0.8),
        leaf=D.mat("Leaf", "#68BC52", rough=0.6),
        leafSad=D.mat("LeafSad", "#D3C34E", rough=0.65),
        sky=D.mat("Sky", "#7CCBFF", rough=0.6),
        chrome=D.mat("Chrome", "chrome", rough=0.3, metal=0.4),
        # aliases the shared stapler/duck builders expect
        arm=red, base=ink, duck=yellow, bill=D.mat("Orange", "orange", rough=0.45), eye=ink,
        shine=paper, cheek=pink,
    )


def box(M):
    lib.rbox("Box_Bottom", (W, DP, T), (0, 0, T / 2), M["kraft"], r=0.004, seg=1)
    for sy in (-1, 1):
        lib.rbox(f"Box_Wall{sy}", (W, T, H), (0, sy * (DP / 2 - T / 2), H / 2), M["kraft"],
                 r=0.004, seg=2)
    for sx in (-1, 1):
        lib.rbox(f"Box_Side{sx}", (T, DP - 2 * T + 0.002, H), (sx * (W / 2 - T / 2), 0, H / 2),
                 M["kraft"], r=0.004, seg=2)
        D.face(f"Box_Hole{sx}", D.rrect_pts(0.03, 0.085, 0.015), M["brown"],
               loc=(sx * (W / 2 + 0.0006), 0, H - 0.052), rot=(0, sx * math.pi / 2, 0))


def flaps(M):
    # Front flap hangs down over the front wall (hinged on its outer top edge).
    y = -DP / 2 - FLAP / 2 - 0.0005
    part = D.snapshot()
    lib.rbox("Flap_Front", (W - 0.008, FLAP, 0.15), (0, y, H + 0.075), M["flap"], r=0.0025, seg=1)
    D.turn(D.since(part), (0, y, H), (math.radians(178), 0, 0))
    y = DP / 2 - FLAP / 2
    part = D.snapshot()
    lib.rbox("Flap_Back", (W - 0.01, FLAP, 0.15), (0, y, H + 0.075), M["flap"], r=0.0025, seg=1)
    D.turn(D.since(part), (0, y, H), (math.radians(-100), 0, 0))
    for sx, ang in ((-1, -112), (1, 104)):
        x = sx * (W / 2 - FLAP / 2)
        part = D.snapshot()
        lib.rbox(f"Flap_Side{sx}", (FLAP, DP - 0.012, 0.14), (x, 0, H + 0.07), M["flap"],
                 r=0.0025, seg=1)
        D.turn(D.since(part), (x, 0, H), (0, math.radians(ang), 0))


def scribbles(M):
    # "MY STUFF" on the hanging flap (its face tips up 2°), a frowny face on the wall below.
    yf = -DP / 2 - FLAP - 0.0035
    D.text("Label_MyStuff", "MY STUFF", 0.05, M["ink"], loc=(0.025, yf, 0.192), depth=0, res=2,
           rot=(math.pi / 2 - math.radians(2), math.radians(-3), 0))
    y = -DP / 2 - 0.0009
    cx, cz, r = 0.0, 0.062, 0.028
    ring = [(cx + r * math.cos(a), y, cz + r * math.sin(a))
            for a in [2 * math.pi * k / 18 for k in range(19)]]
    D.tube("Label_Face", ring, 0.0026, M["ink"], verts=5, caps=None)
    for s in (-1, 1):
        D.face(f"Label_Eye{s}", D.circle_pts(0.004, 10), M["ink"],
               loc=(cx + s * 0.01, y + 0.0004, cz + 0.008), rot=D.FRONT)
    D.tube("Label_Frown", [(cx - 0.013, y, cz - 0.015), (cx, y, cz - 0.007),
                           (cx + 0.013, y, cz - 0.015)], 0.0024, M["ink"], verts=5, smooth=3)
    # A red FRAGILE stamp on the right side (their feelings are).
    xs = W / 2 + 0.0008
    D.text("Stamp_Fragile", "FRAGILE", 0.036, M["red"], loc=(xs, 0.005, 0.1), depth=0, res=2,
           rot=(math.pi / 2, math.radians(8), math.pi / 2))
    frame = D.rrect_pts(0.2, 0.06, 0.012, steps=3)
    pts = [Vector((0, x, z)) for x, z in frame] + [Vector((0, frame[0][0], frame[0][1]))]
    rot = Matrix.Rotation(math.radians(-8), 4, "X")  # same in-plane spin as the text
    D.tube("Stamp_Border", [tuple(Vector((xs + 0.0004, 0.005, 0.1)) + (rot @ p)) for p in pts],
           0.0022, M["red"], verts=5, caps=None)


def plant(M):
    """Wilting desk plant at the back-left; the stems flop over the front-left rim."""
    px, py, pz = -0.1, 0.035, 0.16
    D.lathe("Plant_Pot", [(0.0, pz), (0.04, pz), (0.044, pz + 0.004), (0.054, pz + 0.085),
                          (0.06, pz + 0.088), (0.061, pz + 0.1), (0.056, pz + 0.103),
                          (0.05, pz + 0.098), (0.0, pz + 0.098)], M["pot"], loc=(px, py, 0),
            verts=20, sharp=60)
    lib.cyl("Plant_Soil", 0.05, 0.006, (px, py, pz + 0.097), M["brown"], r=0, verts=16)
    top = Vector((px, py, pz + 0.1))
    # (yaw degrees, reach, droop below the rim, leaf)
    leaves = ((205, 0.15, 0.09, "leaf"), (240, 0.17, 0.12, "leaf"), (265, 0.16, 0.1, "leafSad"),
              (180, 0.12, 0.07, "leaf"), (290, 0.12, 0.05, "leaf"), (120, 0.07, 0.0, "leaf"))
    for i, (yaw, reach, droop, key) in enumerate(leaves):
        a = math.radians(yaw)
        d = Vector((math.cos(a), math.sin(a), 0))
        pts = [top, top + d * reach * 0.25 + Vector((0, 0, 0.055)),
               top + d * reach * 0.7 + Vector((0, 0, 0.05)),
               top + d * reach + Vector((0, 0, 0.01 - droop * 0.4))]
        D.tube(f"Plant_Stem{i}", pts, 0.0042, M["leaf"], verts=5, smooth=3)
        hang = (d * 0.3 + Vector((0, 0, -1))).normalized()
        lib.sphere(f"Plant_Leaf{i}", 1.0, tuple(pts[-1] + hang * 0.036), M[key],
                   scale=(0.028, 0.045, 0.0075), u=10, v=5,
                   rot=hang.to_track_quat("Y", "Z").to_euler())
    # One leaf has already given up.
    lib.sphere("Plant_Fallen", 1.0, (-0.17, -0.235, 0.0075), M["leafSad"],
               scale=(0.028, 0.045, 0.0075), u=10, v=5, rot=(0, 0, math.radians(35)))


def contents(M):
    st = D.snapshot()
    stapler.make(M)
    D.place(D.since(st), loc=(0.115, -0.05, 0.228), rot=(0, math.radians(24), math.radians(135)))
    fr = D.snapshot()
    fw, fh = 0.11, 0.14
    D.slab("Photo_Frame", D.rrect_pts(fw, fh, 0.01), 0.014, M["brown"], rot=D.FRONT, r=0.003)
    D.face("Photo_Sky", D.rrect_pts(fw - 0.03, fh - 0.03, 0.004), M["sky"], loc=(0, -0.0072, 0),
           rot=D.FRONT)
    D.face("Photo_Hill", [(-0.04, -0.055), (0.04, -0.055), (0.04, -0.02), (0.01, -0.005),
                          (-0.015, -0.025), (-0.04, -0.01)], M["leaf"], loc=(0, -0.0075, 0),
           rot=D.FRONT)
    D.face("Photo_Sun", D.circle_pts(0.012, 14), M["yellow"], loc=(0.018, -0.0075, 0.028),
           rot=D.FRONT)
    D.place(D.since(fr), loc=(0.065, 0.08, 0.26), rot=(math.radians(-12), 0, math.radians(-6)))
    ro = D.snapshot()
    lib.cyl("Poster_Roll", 0.021, 0.38, (0, 0, 0.19), M["sky"], r=0.004, seg=1, verts=14)
    lib.cyl("Poster_End", 0.0145, 0.004, (0, 0, 0.3795), M["paper"], r=0, verts=14)
    lib.cyl("Poster_Hole", 0.0055, 0.004, (0, 0, 0.3815), M["ink"], r=0, verts=10)
    lib.torus("Poster_Band", 0.0215, 0.0024, (0, 0, 0.25), M["pink"], seg=14, ring=5)
    D.place(D.since(ro), loc=(0.16, 0.1, 0.02), rot=(math.radians(-15), math.radians(13), 0))
    du = D.snapshot()
    rubber_duck.make(M, detail=0.5)
    D.place(D.since(du), loc=(-0.015, -0.1, 0.198), rot=(math.radians(6), 0, math.radians(-8)))


def build():
    lib.begin(NAME)
    M = materials()
    box(M)
    flaps(M)
    scribbles(M)
    plant(M)
    contents(M)


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META)
