"""Cardboard box: the "you're let go" box, packed solid. An open kraft box (side and back
flaps flopped outward, the front flap hanging down with "MY STUFF" scrawled on it in
marker, a frowny doodle under it, a red FRAGILE stamp on the side), filled to just above
the rim: two binders and a stack of folders at the bottom; on top, three books with the
rubber duck perched on them peeking over the front, a perky desk plant, a framed photo
against the back, a rolled-up poster leaning in a corner, a mug full of pens, a little gold
trophy, a snack box, a coiled cable and the red stapler. Every item is dropped with Bullet
at build time and rests where it lands, so nothing floats. 0.4 × 0.3 × 0.26 m box; origin
at the floor-contact centre; the label faces -Y."""
import math

import bpy
from mathutils import Vector

import lib
from decor import _decor as D
from decor import mug, rubber_duck, stapler

NAME = "cardboard_box"
AO_RES = 512
AO_DISTANCE = 0.06
W, DP, H, T = 0.40, 0.30, 0.26, 0.012
FLAP = 0.006
META = dict(
    name="Cardboard box", category="decor", priority="P0",
    description="Box of desk stuff for someone being let go, packed to the rim: binders, "
                "books, plant, photo, poster, mug of pens, trophy, snacks, cable, stapler "
                "and the duck",
    tags=["let-go", "carry", "funny"], tintable=[],
    anchors_bl={"handL": (-W / 2, 0, H - 0.05), "handR": (W / 2, 0, H - 0.05),
                "top": (0, 0, H)},
)


def materials():
    """Shared by colour so the box stays at a modest number of draw calls."""
    ink = D.mat("Ink", "ink", rough=0.55)
    paper = D.mat("Paper", "paper", rough=0.75)
    yellow = D.mat("Yellow", "duck", rough=0.4)
    red = D.mat("Red", "red", rough=0.45)
    pink = D.mat("Pink", "#FF8FB1", rough=0.6)
    sky = D.mat("Sky", "#7CCBFF", rough=0.6)
    blue = D.mat("Blue", "blue", rough=0.55)
    teal = D.mat("Teal", "teal", rough=0.55)
    orange = D.mat("Orange", "orange", rough=0.5)
    chrome = D.mat("Chrome", "chrome", rough=0.3, metal=0.4)
    return dict(
        kraft=D.mat("Cardboard", "kraft", rough=0.85),
        flap=D.mat("CardboardLight", "#E6B47C", rough=0.85),
        brown=D.mat("Brown", "#7A5232", rough=0.75),
        manila=D.mat("Manila", "#F0CB7E", rough=0.8),
        gold=D.mat("Gold", "gold", rough=0.3, metal=0.35),
        pot=D.mat("Pot", "pot", rough=0.8),
        leaf=D.mat("Leaf", "#5DBE55", rough=0.6),
        leafSad=D.mat("LeafSad", "#C9C255", rough=0.65),
        ink=ink, paper=paper, yellow=yellow, red=red, pink=pink, sky=sky, blue=blue,
        teal=teal, orange=orange, chrome=chrome,
        # aliases the shared stapler / duck / mug / pen builders expect
        arm=red, base=ink, duck=yellow, bill=orange, eye=ink, shine=paper, cheek=pink,
        glaze=teal, inside=paper, coffee=ink, foam=paper,
    )


# ---------------------------------------------------------------- the box

def box(M):
    parts = [lib.rbox("Box_Bottom", (W, DP, T), (0, 0, T / 2), M["kraft"], r=0.004, seg=1)]
    for sy in (-1, 1):
        parts.append(lib.rbox(f"Box_Wall{sy}", (W, T, H), (0, sy * (DP / 2 - T / 2), H / 2),
                              M["kraft"], r=0.004, seg=2))
    for sx in (-1, 1):
        parts.append(lib.rbox(f"Box_Side{sx}", (T, DP - 2 * T + 0.002, H),
                              (sx * (W / 2 - T / 2), 0, H / 2), M["kraft"], r=0.004, seg=2))
        D.face(f"Box_Hole{sx}", D.rrect_pts(0.03, 0.085, 0.015), M["brown"],
               loc=(sx * (W / 2 + 0.0006), 0, H - 0.052), rot=(0, sx * math.pi / 2, 0))
    return parts


def flaps(M):
    out = []
    # Front flap hangs down over the front wall (hinged on its outer top edge).
    y = -DP / 2 - FLAP / 2 - 0.0005
    part = D.snapshot()
    lib.rbox("Flap_Front", (W - 0.008, FLAP, 0.15), (0, y, H + 0.075), M["flap"], r=0.0025, seg=1)
    out += D.turn(D.since(part), (0, y, H), (math.radians(178), 0, 0))
    y = DP / 2 - FLAP / 2
    part = D.snapshot()
    lib.rbox("Flap_Back", (W - 0.01, FLAP, 0.15), (0, y, H + 0.075), M["flap"], r=0.0025, seg=1)
    out += D.turn(D.since(part), (0, y, H), (math.radians(-100), 0, 0))
    for sx, ang in ((-1, -112), (1, 104)):
        x = sx * (W / 2 - FLAP / 2)
        part = D.snapshot()
        lib.rbox(f"Flap_Side{sx}", (FLAP, DP - 0.012, 0.14), (x, 0, H + 0.07), M["flap"],
                 r=0.0025, seg=1)
        out += D.turn(D.since(part), (x, 0, H), (0, math.radians(ang), 0))
    return out


def scribbles(M):
    # "MY STUFF" on the hanging flap (its face tips up 2°), a frowny face on the wall below.
    yf = -DP / 2 - FLAP - 0.0035
    D.text("Label_MyStuff", "MY STUFF", 0.05, M["ink"], loc=(0.025, yf, 0.192), depth=0, res=2,
           rot=(math.pi / 2 - math.radians(2), math.radians(-3), 0))
    y = -DP / 2 - 0.0009
    cx, cz = 0.0, 0.062
    D.ring("Label_Face", 0.0305, 0.0255, M["ink"], n=22, loc=(cx, y, cz), rot=D.FRONT)
    for s in (-1, 1):
        D.face(f"Label_Eye{s}", D.circle_pts(0.004, 10), M["ink"],
               loc=(cx + s * 0.01, y + 0.0004, cz + 0.008), rot=D.FRONT)
    D.tube("Label_Frown", [(cx - 0.013, y, cz - 0.015), (cx, y, cz - 0.007),
                           (cx + 0.013, y, cz - 0.015)], 0.0024, M["ink"], verts=5, smooth=3)
    # A red FRAGILE stamp on the right side (their feelings are).
    xs, ys, zs = W / 2 + 0.0008, -0.03, 0.085
    spin = (math.pi / 2, math.radians(8), math.pi / 2)
    D.text("Stamp_Fragile", "FRAGILE", 0.036, M["red"], loc=(xs, ys, zs), depth=0, res=1,
           rot=spin)
    D.band("Stamp_Border", D.rrect_pts(0.2, 0.058, 0.012, steps=3),
           D.rrect_pts(0.192, 0.05, 0.008, steps=3), M["red"], loc=(xs, ys, zs), rot=spin)


# ---------------------------------------------------------------- the stuff (built at the origin)

def binder(name, M, w, d, t, cover):
    before = D.snapshot()
    lib.rbox(f"{name}_Pages", (w - 0.014, d - 0.01, t - 0.006), (0.004, 0, t / 2), M["paper"],
             r=0.002, seg=1)
    for z in (0.002, t - 0.002):
        lib.rbox(f"{name}_Cover{z:.3f}", (w, d, 0.004), (0, 0, z), M[cover], r=0.0018, seg=1)
    lib.rbox(f"{name}_Spine", (0.014, d, t), (-w / 2 + 0.007, 0, t / 2), M[cover], r=0.005, seg=2)
    D.face(f"{name}_Label", D.rrect_pts(0.05, d * 0.45, 0.004), M["paper"],
           loc=(-w / 2 + 0.03, 0, t + 0.0002))
    return D.bundle(name, D.since(before))


def folders(name, M):
    before = D.snapshot()
    z = 0.0
    for k, (key, dx, yaw) in enumerate((("manila", 0.0, 1.5), ("paper", 0.006, -2.0),
                                        ("sky", -0.004, 3.0), ("paper", 0.003, -1.0),
                                        ("manila", -0.006, -3.5), ("paper", 0.0, 2.0))):
        th = 0.009 if key != "paper" else 0.005
        lib.rbox(f"{name}{k}", (0.345, 0.25, th), (dx, 0, z + th / 2), M[key], r=0.0015, seg=1,
                 rot=(0, 0, math.radians(yaw)))
        z += th
    return D.bundle(name, D.since(before))


def book(name, M, w, d, t, cover):
    """Hardback lying flat: boards top and bottom, a spine on -X, cream page edges showing
    on the three open sides, two gold bands on the front board."""
    before = D.snapshot()
    for z in (0.0016, t - 0.0016):
        lib.rbox(f"{name}_Board{z:.4f}", (w, d, 0.0032), (0, 0, z), M[cover], r=0.0012, seg=1)
    lib.rbox(f"{name}_Spine", (0.008, d, t), (-w / 2 + 0.004, 0, t / 2), M[cover], r=0.0035,
             seg=2)
    lib.rbox(f"{name}_Pages", (w - 0.01, d - 0.005, t - 0.0062), (0.002, 0, t / 2), M["paper"],
             r=0.0012, seg=1)
    for x in (-w / 2 + 0.025, -w / 2 + 0.04):
        D.face(f"{name}_Band{x:.3f}", D.rrect_pts(0.007, d - 0.012, 0.0025, steps=1), M["gold"],
               loc=(x, 0, t + 0.0002))
    return D.bundle(name, D.since(before))


def plant(M):
    """A perky desk plant: the pot is the rigid body, the leaves ride along as its child."""
    before = D.snapshot()
    zs = D.pot("Plant_PotShell", 0.04, 0.052, 0.1, M["pot"], M["brown"], rim=0.008, verts=20)
    pot = D.bundle("Pot", D.since(before))
    before = D.snapshot()
    top = Vector((0, 0, zs + 0.002))
    # (yaw, tilt from vertical, stem length, how far the leaf droops)
    for i, (yaw, tilt, ln, droop) in enumerate(((20, 14, 0.11, 25), (95, 24, 0.1, 35),
                                                (165, 18, 0.12, 28), (230, 30, 0.09, 45),
                                                (300, 22, 0.1, 32), (60, 34, 0.08, 50),
                                                (200, 8, 0.13, 20))):
        a, t = math.radians(yaw), math.radians(tilt)
        d = Vector((math.sin(t) * math.cos(a), math.sin(t) * math.sin(a), math.cos(t)))
        tip = top + d * ln + Vector((0, 0, -0.008))
        D.tube(f"Plant_Stem{i}", [tuple(top), tuple(top + d * ln * 0.55), tuple(tip)], 0.0042,
               M["leaf"], verts=4, smooth=2, caps=None)
        t2 = math.radians(min(tilt + droop, 85))
        d2 = Vector((math.sin(t2) * math.cos(a), math.sin(t2) * math.sin(a), math.cos(t2)))
        lib.sphere(f"Plant_Leaf{i}", 1.0, tuple(tip + d2 * 0.036), M["leafSad" if i == 3 else "leaf"],
                   scale=(0.026, 0.008, 0.042), u=8, v=5, rot=d2.to_track_quat("Z", "Y").to_euler())
    leaves = D.bundle("Plant_Leaves", D.since(before))
    return pot, leaves


def photo(M):
    before = D.snapshot()
    fw, fh = 0.14, 0.165
    D.slab("Photo_Frame", D.rrect_pts(fw, fh, 0.012), 0.016, M["brown"], rot=D.FRONT, r=0.003)
    D.face("Photo_Sky", D.rrect_pts(fw - 0.034, fh - 0.034, 0.004), M["sky"],
           loc=(0, -0.0082, 0), rot=D.FRONT)
    D.face("Photo_Hill", [(-0.053, -0.073), (0.053, -0.073), (0.053, -0.025), (0.012, -0.006),
                          (-0.02, -0.03), (-0.053, -0.012)], M["leaf"], loc=(0, -0.0085, 0),
           rot=D.FRONT)
    D.face("Photo_Sun", D.circle_pts(0.015, 14), M["yellow"], loc=(0.022, -0.0085, 0.038),
           rot=D.FRONT)
    D.place(D.since(before), loc=(0, 0, fh / 2))
    return D.bundle("Photo", D.since(before))


def poster(M):
    before = D.snapshot()
    ln = 0.36
    lib.cyl("Poster_Roll", 0.024, ln, (0, 0, 0), M["sky"], r=0.004, seg=1, verts=14)
    for s in (-1, 1):
        lib.cyl(f"Poster_End{s}", 0.016, 0.004, (0, 0, s * (ln / 2 - 0.0005)), M["paper"], r=0,
                verts=14)
        lib.cyl(f"Poster_Hole{s}", 0.006, 0.004, (0, 0, s * (ln / 2 + 0.0015)), M["ink"], r=0,
                verts=10)
    lib.torus("Poster_Band", 0.0245, 0.0024, (0, 0, 0.06), M["pink"], seg=12, ring=4)
    return D.bundle("Poster", D.since(before))


def mug_of_pens(M):
    """A teal mug (rigid body) with pens and a pencil standing in it (its child)."""
    before = D.snapshot()
    s = 0.92
    mug.make(M, s=s, heart=False, verts=20, handle_verts=8)
    cup = D.bundle("PenMug", D.since(before))
    before = D.snapshot()
    floor = mug.COFFEE_Z * s
    for k, (key, x, y, rx, ry, ln) in enumerate((("yellow", -0.01, 0.008, -8, -11, 0.13),
                                                  ("blue", 0.011, 0.006, -5, 12, 0.12),
                                                  ("red", 0.0, -0.01, 10, 3, 0.115))):
        D.place(simple_pen(M, key, ln, pencil=(k == 0)), loc=(x, y, floor),
                rot=(math.radians(rx), math.radians(ry), 0))
    pens = D.bundle("PenMug_Pens", D.since(before))
    return cup, pens


def simple_pen(M, colour, ln, pencil=False):
    """A light pen (white body, coloured cap) or pencil (yellow hex, pink eraser)."""
    before = D.snapshot()
    if pencil:
        lib.cyl("Pen_Body", 0.0047, ln, (0, 0, ln / 2), M["yellow"], r=0, verts=6)
        lib.cyl("Pen_Ferrule", 0.0049, 0.008, (0, 0, ln + 0.004), M["chrome"], r=0, verts=8)
        lib.cyl("Pen_Eraser", 0.0046, 0.008, (0, 0, ln + 0.012), M["pink"], r=0.0018, seg=1,
                verts=8)
    else:
        lib.cyl("Pen_Body", 0.0052, ln, (0, 0, ln / 2), M["paper"], r=0, verts=8)
        lib.cyl("Pen_Cap", 0.0058, 0.036, (0, 0, ln - 0.008), M[colour], r=0.0022, seg=1, verts=8)
        lib.rbox("Pen_Clip", (0.003, 0.0024, 0.026), (0, -0.0066, ln - 0.01), M[colour],
                 r=0.001, seg=1)
    return D.since(before)


def trophy(M):
    before = D.snapshot()
    lib.rbox("Trophy_Base", (0.065, 0.05, 0.026), (0, 0, 0.013), M["brown"], r=0.005, seg=2)
    D.lathe("Trophy_Stem", [(0.0, 0.026), (0.016, 0.026), (0.012, 0.032), (0.0065, 0.045),
                            (0.0075, 0.056), (0.0, 0.056)], M["gold"], verts=10)
    D.lathe("Trophy_Cup", [(0.0, 0.054), (0.012, 0.056), (0.026, 0.07), (0.032, 0.092),
                           (0.033, 0.103), (0.03, 0.106), (0.027, 0.1), (0.0, 0.085)],
            M["gold"], verts=14, sharp=60)
    for side in (-1, 1):
        D.tube(f"Trophy_Handle{side}", [(side * 0.03, 0, 0.098), (side * 0.046, 0, 0.094),
                                        (side * 0.046, 0, 0.077), (side * 0.024, 0, 0.068)],
               0.0042, M["gold"], verts=5, smooth=2, caps=None)
    D.face("Trophy_Plate", D.rrect_pts(0.034, 0.012, 0.003, steps=1), M["gold"],
           loc=(0, -0.0255, 0.013), rot=D.FRONT)
    return D.bundle("Trophy", D.since(before))


def snack_box(M):
    """A box of cookies lying flat, cookies printed on top, a red band round it."""
    before = D.snapshot()
    lib.rbox("Snack_Box", (0.11, 0.15, 0.05), (0, 0, 0.025), M["orange"], r=0.006, seg=2)
    lib.rbox("Snack_Band", (0.112, 0.03, 0.052), (0, -0.045, 0.025), M["red"], r=0.006, seg=1)
    for k, (x, y) in enumerate(((-0.022, 0.012), (0.02, 0.03), (0.0, 0.058))):
        D.face(f"Snack_Cookie{k}", D.circle_pts(0.017, 14), M["brown"], loc=(x, y, 0.0503))
    return D.bundle("Snack", D.since(before))


def cable(M):
    """A coiled-up charger cable with its plug."""
    before = D.snapshot()
    n = 12  # points per turn; turns spiral inwards a cable's width apart
    pts = []
    for k in range(int(2.5 * n) + 1):
        a = 2 * math.pi * k / n
        r = 0.032 - 0.007 * (k / n)
        pts.append((r * math.cos(a), r * math.sin(a), 0.0034))
    # The tail crosses over the turns to the plug, which lies in the middle of the coil.
    end = pts[-1]
    pts += [(end[0] * 0.5, end[1] * 0.5, 0.0085), (0.004, 0.002, 0.0085)]
    D.tube("Cable_Wire", pts, 0.0032, M["ink"], verts=5, caps="round")
    lib.rbox("Cable_Plug", (0.02, 0.013, 0.009), (-0.008, 0.004, 0.0098), M["paper"], r=0.003,
             seg=1, rot=(0, 0, math.radians(20)))
    return D.bundle("Cable", D.since(before))


def duck(M):
    before = D.snapshot()
    rubber_duck.make(M, detail=0.42, features=False)
    return D.bundle("Duck", D.since(before))


def the_stapler(M):
    before = D.snapshot()
    stapler.make(M, light=True)
    return D.bundle("Stapler", D.since(before))


HULL = "CONVEX_HULL"  # Blender centres BOX/CYLINDER shapes on the origin; ours sit at the base


def pack(M, colliders):
    """Bulk at the bottom, then each item in its own slot just above where it should land
    (no starting overlaps); Bullet drops them the last few millimetres."""
    z0 = T
    bodies = []

    def drop(ob, loc, rot, shape, mass):
        ob.location = loc
        ob.rotation_euler = tuple(math.radians(a) for a in rot)
        bodies.append((ob, shape, mass))
        return ob

    drop(binder("BinderA", M, 0.36, 0.262, 0.07, "blue"), (0.0, 0.0, z0 + 0.002), (0, 0, 1),
         HULL, 1.0)
    drop(binder("BinderB", M, 0.35, 0.255, 0.064, "red"), (0.004, -0.002, z0 + 0.075), (0, 0, -1.5),
         HULL, 0.9)
    drop(folders("Folders", M), (-0.002, 0.0, z0 + 0.142), (0, 0, 0.5), HULL, 0.5)
    top = z0 + 0.142 + 0.042 + 0.004  # just above where the folders end up
    # Front-left: three books, the duck perched on top peeking over the front rim.
    drop(book("BookA", M, 0.17, 0.125, 0.032, "teal"), (-0.1, -0.068, top), (0, 0, 3), HULL, 0.45)
    drop(book("BookB", M, 0.16, 0.12, 0.028, "yellow"), (-0.102, -0.07, top + 0.036), (0, 0, -4),
         HULL, 0.4)
    drop(book("BookC", M, 0.15, 0.115, 0.03, "pink"), (-0.098, -0.067, top + 0.068), (0, 0, 6),
         HULL, 0.4)
    drop(duck(M), (-0.1, -0.092, top + 0.102), (0, 0, -10), HULL, 0.05)
    # Back-left: the plant; back-middle: the photo against the wall; back-right: the poster
    # standing in the corner, leaning a few degrees into it.
    pot, leaves = plant(M)
    drop(pot, (-0.115, 0.075, top), (2, -3, 0), HULL, 0.8)
    leaves.parent = pot
    drop(photo(M), (0.02, 0.118, top), (-4, 0, 3), HULL, 0.3)
    drop(poster(M), (0.156, 0.106, top + 0.182), (9, -9, 0), HULL, 0.2)  # leans in
    # Middle: the snack box lying flat with the stapler on it; right: the cable coil, and the
    # mug of pens at the front (handle to the wall); front-middle: the trophy.
    drop(snack_box(M), (0.058, 0.034, top), (0, 0, 2), HULL, 0.15)
    drop(the_stapler(M), (0.056, 0.036, top + 0.058), (0, 3, 80), HULL, 0.3)
    drop(cable(M), (0.152, -0.006, top), (2, 3, 20), HULL, 0.15)
    cup, pens = mug_of_pens(M)
    drop(cup, (0.099, -0.09, top), (1, 2, 0), HULL, 0.35)
    pens.parent = cup
    trophy_ob = trophy(M)
    trophy_ob.scale = (0.85, 0.85, 0.85)
    drop(trophy_ob, (0.022, -0.092, top), (0, 0, 75), HULL, 0.3)
    D.settle(bodies, colliders)


def build():
    lib.begin(NAME)
    M = materials()
    colliders = [(ob, "BOX") for ob in box(M) + flaps(M)]
    scribbles(M)
    pack(M, colliders)
    # One leaf has already given up.
    D.prism("Plant_Fallen", leaf_pts(0.075, 0.044), 0.005, M["leafSad"],
            loc=(-0.2, -0.235, 0.0), rot=(0, 0, math.radians(35)), r=0.002, seg=1)


def leaf_pts(length, width, n=16):
    """Pointed lens-shaped leaf outline along Y."""
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        x = width / 2 * math.sin(t) * (1 - 0.25 * math.cos(t))
        y = length / 2 * math.cos(t)
        pts.append((x * abs(math.sin(t)) ** 0.15, y))
    return pts


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META)
