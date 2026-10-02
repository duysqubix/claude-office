"""Held box: the "you're free to go" cardboard box, carried out with both hands. Chunky
kraft walls, the top flaps flopped open, hand-hole slots on the sides, a strip of tape, and
a whole desk life packed in. Two binders lie flat on the floor; on them stand a little
succulent in a terracotta pot (on two books), a framed photo leaning on the back wall (on a
stack of folders, the red stapler in front of it), a row of books along one side, and a
folded cardigan with one sleeve flopped over the front rim, carrying a mug of pencils and
the rubber duck. Every item rests on the floor of the box or on another item: heights are
stacked from FLOOR up, nothing is placed by eye. Pivot = midway between the hands (the
hand holes); anchors handL / handR are the mitten centres. Front faces -Y (away from the
carrier)."""
import math

from mathutils import Matrix, Vector

from characters import _kit as kit

import lib

NAME = "held_box"
W, D, H, T = 0.38, 0.28, 0.24, 0.012
Z0 = -0.14            # box bottom below the hand holes
TOP = Z0 + H
FLOOR = Z0 + T        # the inside floor
XI, YI = W / 2 - T, D / 2 - T     # inner half sizes
WALL_R = 0.005        # bevel on the walls' edges
FRONT_FLAP = 118      # degrees the front flap has flopped open (it hangs out and down)
META = dict(
    name="Box of desk stuff (held)", category="character-held", priority="P0",
    description="Open cardboard box packed full of desk stuff: plant, photo, rubber duck, "
                "mug of pencils, books, stapler and a cardigan sleeve over the edge; carried "
                "in both hands",
    tags=["held", "box", "leaving", "fired"], tintable=[],
    anchors_bl={"handL": (W / 2 + 0.035, 0, 0), "handR": (-W / 2 - 0.035, 0, 0),
                "gripL": tuple(kit.Vector((W / 2 + 0.035, 0, 0)) - kit.hand_from_grip()),
                "gripR": tuple(kit.Vector((-W / 2 - 0.035, 0, 0)) - kit.hand_from_grip())},
)


def materials():
    """Shared by colour, so the packed box stays at a modest number of draw calls."""
    yellow = kit.flat("Yellow", "#FFD93D", rough=0.5)
    ink = kit.flat("Ink", "#1E1B2E", rough=0.3)
    return dict(
        kraft=kit.flat("Kraft", "#D9A066", rough=0.85),
        dark=kit.flat("KraftDark", "#8E6239", rough=0.85),
        tape=kit.flat("Tape", "#EBCB91", rough=0.45),
        pot=kit.flat("Pot", "#E07A4F", rough=0.75),
        soil=kit.flat("Soil", "#6B4A32", rough=0.95),
        leaf=kit.flat("Leaf", "#4CC46A", rough=0.6),
        sky=kit.flat("PhotoSky", "#7FD8FF", rough=0.5),
        paper=kit.flat("Paper", "#FFFDF7", rough=0.7),
        manila=kit.flat("Manila", "#F2D49B", rough=0.7),
        blue=kit.flat("Blue", "#4D96FF", rough=0.55),
        purple=kit.flat("Purple", "#9B5DE5", rough=0.55),
        teal=kit.flat("Teal", "#2EC4B6", rough=0.5),
        pink=kit.flat("Pink", "#FF8FB1", rough=0.6),
        orange=kit.flat("Orange", "#FF9F45", rough=0.5),
        red=kit.flat("Red", "#FF5A5F", rough=0.45),
        knit=kit.flat("Knit", "#A79BFF", rough=0.9),
        yellow=yellow, ink=ink,
    )


def card(ob):
    """Thin card, paper and hidden layers: a plain flat-shaded box, no bevel to pay for."""
    ob.data.shade_flat()
    return ob


def block(name, size, at, z, material, yaw=0.0, r=0.004):
    """Flat-bottomed block standing on height z (`at` = its x, y centre). Returns its top,
    so stacks are built bottom-up and every layer sits on the one below. r=0: a card()."""
    ob = lib.rbox(name, size, (at[0], at[1], z + size[2] / 2), material, r=r, seg=1,
                  rot=(0, 0, math.radians(yaw)))
    if r == 0:
        card(ob)
    return z + size[2]


def front_flap_point(x, s, lift=0.0):
    """World point on the top face of the front flap, s along it from the hinge, lifted
    `lift` off the face (things draped over the rim lie on this)."""
    m = Matrix.Translation((0, -(D / 2 - T / 2), TOP)) @ \
        Matrix.Rotation(math.radians(FRONT_FLAP), 4, "X")
    return m @ Vector((x, T * 0.4 + lift, s))   # the flap is T * 0.8 thick


def box(M):
    zc = Z0 + H / 2
    lib.rbox("Box_Bottom", (W, D, T), (0, 0, Z0 + T / 2), M["kraft"], r=0.004, seg=1)
    for s, nm in ((-1, "Front"), (1, "Back")):
        lib.rbox(f"Box_{nm}", (W, T, H), (0, s * (D / 2 - T / 2), zc), M["kraft"], r=WALL_R,
                 seg=1)
    for s, nm in ((1, "SideL"), (-1, "SideR")):
        lib.rbox(f"Box_{nm}", (T, D - 2 * T, H), (s * (W / 2 - T / 2), 0, zc), M["kraft"],
                 r=WALL_R, seg=1)
        card(lib.rbox(f"Box_Hole{nm}", (0.006, 0.09, 0.03), (s * (W / 2 + 0.0005), 0, 0.0),
                      M["dark"], r=0))
    # Flaps flopped open: the long ones hang outward, the short ones splay up and out.
    for s, nm, ang in ((-1, "FlapFront", FRONT_FLAP), (1, "FlapBack", 104)):
        f = lib.rbox(f"Box_{nm}", (W - 0.012, T * 0.8, D * 0.48), (0, 0, D * 0.24),
                     M["kraft"], r=0.004, seg=1)
        kit.transform([f], Matrix.Translation((0, s * (D / 2 - T / 2), TOP)) @
                      Matrix.Rotation(math.radians(-s * ang), 4, "X"))
    for s, nm, ang in ((1, "FlapL", 62), (-1, "FlapR", 70)):
        f = lib.rbox(f"Box_{nm}", (T * 0.8, D - 0.03, W * 0.4), (0, 0, W * 0.2), M["kraft"],
                     r=0.004, seg=1)
        kit.transform([f], Matrix.Translation((s * (W / 2 - T / 2), 0, TOP)) @
                      Matrix.Rotation(math.radians(s * ang), 4, "Y"))
    card(lib.rbox("Box_Tape", (0.06, 0.002, H + 0.004), (-0.07, -D / 2 - 0.001, Z0 + H / 2),
                  M["tape"], r=0))


def binders(M):
    """Two binders flat on the floor, spine labels to the front. Returns their top: the
    shelf the rest of the stuff stands on."""
    z = FLOOR
    for nm, size, at, yaw, m in (("BinderA", (0.34, 0.24, 0.045), (0.002, 0.002), 1.5, "blue"),
                                 ("BinderB", (0.34, 0.232, 0.045), (-0.002, -0.003), -1,
                                  "purple")):
        label = card(lib.rbox(f"{nm}_Label", (0.07, 0.004, 0.022),
                              (-0.06, -size[1] / 2, size[2] / 2), M["paper"], r=0))
        kit.transform([label], Matrix.Translation((at[0], at[1], z)) @
                      Matrix.Rotation(math.radians(yaw), 4, "Z"))
        z = block(f"{nm}_Cover", size, at, z, M[m], yaw=yaw, r=0)
    return z


def book(name, size, at, z, material, M, yaw=0.0, upright=False):
    """Hardback standing on z, its cream page block showing between the covers. Lying:
    `size` = (length, width, thickness); upright (spine up): (thickness, length, height)."""
    top = block(f"{name}_Cover", size, at, z, material, yaw=yaw)
    if upright:   # spine up: the pages show at both ends
        pages = (size[0] - 0.008, size[1] + 0.002, size[2] - 0.006)
        pz = z + 0.003 + pages[2] / 2
    else:         # lying: the pages show all round between the covers
        pages = (size[0] + 0.002, size[1] + 0.002, size[2] - 0.01)
        pz = z + size[2] / 2
    card(lib.rbox(f"{name}_Pages", pages, (at[0], at[1], pz), M["paper"], r=0,
                  rot=(0, 0, math.radians(yaw))))
    return top


def plant(M, x, y, z):
    """Succulent in a terracotta pot whose flat base stands on height z."""
    lib.lathe("Plant_Pot", [(0, 0), (0.045, 0), (0.052, 0.008), (0.058, 0.07),
                            (0.064, 0.072), (0.064, 0.088), (0, 0.088)], loc=(x, y, z),
              material=M["pot"], verts=16)
    lib.cyl("Plant_Soil", 0.056, 0.006, (x, y, z + 0.086), M["soil"], r=0, verts=12)
    for i, (tilt, yaw, s) in enumerate([(8, 0, 1.0), (35, 80, 0.9), (38, 200, 0.9),
                                        (40, 300, 0.85), (22, 140, 0.8)]):
        t, p = math.radians(tilt), math.radians(yaw)
        d = Vector((math.sin(t) * math.cos(p), math.sin(t) * math.sin(p), math.cos(t)))
        c = Vector((x, y, z + 0.09)) + d * 0.045 * s
        lib.sphere(f"Plant_Leaf{i}", 1.0, tuple(c), M["leaf"],
                   scale=(0.024 * s, 0.024 * s, 0.05 * s), u=8, v=5,
                   rot=d.to_track_quat("Z", "Y").to_euler())


def folders(M, at, z):
    """Stack of folders standing on z, a sheet poking out of the middle one. Returns its
    top."""
    for i, (dx, dy, yaw, m) in enumerate(((0.0, 0.0, 2, "manila"), (0.002, -0.003, -3, "yellow"),
                                          (-0.001, 0.002, 3, "manila"))):
        if i == 1:
            card(lib.rbox("Folder1_Sheet", (0.085, 0.1, 0.003),
                          (at[0] - 0.004, at[1] - 0.008, z + 0.012), M["paper"], r=0,
                          rot=(0, 0, math.radians(-8))))
        z = block(f"Folder{i}_Card", (0.1, 0.112, 0.024), (at[0] + dx, at[1] + dy), z, M[m],
                  yaw=yaw, r=0)
    return z


def photo(M, x, z, tilt=14, yaw=4):
    """Framed photo standing on height z, leaning back: its back face meets the back wall
    where the wall's flat inner face ends under the bevelled top edge. Modelled with the
    pivot on its bottom back edge."""
    fw, ft, fh = 0.13, 0.016, 0.16
    tilt, yaw = math.radians(tilt), math.radians(yaw)
    # How far forward of the wall the pivot sits for the back face to touch it just under
    # the bevel (the farther top corner leans on the wall; yaw turns the other one away).
    reach = (fw / 2) * math.sin(yaw) + (TOP - WALL_R - z) * math.tan(tilt) * math.cos(yaw)
    # The frame's 4 mm bevel lifts the tilted bottom edge by r·sin(tilt): drop by as much.
    fr = Matrix.Translation((x, YI - reach, z - 0.004 * math.sin(tilt))) @ \
        Matrix.Rotation(yaw, 4, "Z") @ Matrix.Rotation(-tilt, 4, "X")
    parts = [
        lib.rbox("Photo_Frame", (fw, ft, fh), (0, -ft / 2, fh / 2), M["dark"], r=0.004,
                 seg=1),
        card(lib.rbox("Photo_Sky", (0.1, 0.004, 0.128), (0, -ft - 0.001, fh / 2), M["sky"],
                      r=0)),
        card(lib.rbox("Photo_Grass", (0.1, 0.005, 0.045), (0, -ft - 0.0025, fh / 2 - 0.04),
                      M["leaf"], r=0)),
        lib.cyl("Photo_Sun", 0.016, 0.004, (0.025, -ft - 0.002, fh / 2 + 0.035), M["yellow"],
                r=0, verts=10, rot=(math.pi / 2, 0, 0)),
    ]
    kit.transform(parts, fr)


def stapler(M, x, y, z, yaw=20):
    """The red stapler, closed, lying on height z."""
    m = Matrix.Translation((x, y, 0)) @ Matrix.Rotation(math.radians(yaw), 4, "Z")
    base = lib.rbox("Stapler_Base", (0.1, 0.03, 0.012), (0, 0, z + 0.006), M["ink"],
                    r=0.004, seg=1)
    arm = lib.rbox("Stapler_Arm", (0.096, 0.026, 0.016), (0.002, 0, z + 0.02), M["red"],
                   r=0.006, seg=1)
    kit.transform([base, arm], m)


def side_books(M, z):
    """Hardbacks standing spine-up on z along the +X wall."""
    x = XI - 0.002
    for i, (t, length, h, dy, m) in enumerate(((0.026, 0.22, 0.16, 0.0, "teal"),
                                              (0.026, 0.2, 0.148, -0.008, "orange"),
                                              (0.022, 0.205, 0.155, 0.004, "purple"))):
        book(f"BookU{i}", (t, length, h), (x - t / 2, dy), z, M[m], M, upright=True)
        x -= t + 0.002


def cardigan(M, z):
    """Folded cardigan across the front, standing on z. One flattened sleeve climbs out,
    leans on the front wall, crosses the rim and lies down the front flap, narrowing to a
    ribbed cuff. Returns the top of the fold (things sit on it)."""
    h = 0.08
    lib.rbox("Cardigan_Fold", (0.265, 0.115, h), (-0.04, -0.064, z + h / 2), M["knit"],
             r=0.022, seg=2, rot=(0, 0, math.radians(1.5)))
    flat = 0.38                 # the sleeve's thickness as a fraction of its width

    def half_width(t):          # t: 0 at the shoulder (inside the fold) .. 1 at the cuff
        return (0.03 - 0.009 * t) * (1 + 0.07 * math.sin(6 * math.pi * t))   # rumples

    def lie(t):                 # centre's height over a surface the sleeve lies on
        return half_width(t) * flat + 0.0005

    inside = [Vector((-0.03, -0.085, z + h - 0.014)),
              Vector((-0.036, -(YI - lie(0.2)), TOP - 0.025)),
              Vector((-0.042, -0.12, TOP + lie(0.4) + 0.001))]
    over = [front_flap_point(x, s, lift=lie(t)) for x, s, t in ((-0.048, 0.012, 0.6),
                                                                 (-0.055, 0.055, 0.8),
                                                                 (-0.062, 0.1, 1.0))]
    pts = kit.catmull(inside + over, samples=8)
    kit.tube("Cardigan_Sleeve", pts, half_width, M["knit"], ring=8, caps=False, squash=flat)
    tang = (pts[-1] - pts[-2]).normalized()
    kit.tube("Cardigan_Cuff", [pts[-1] - tang * 0.014, pts[-1] + tang * 0.004],
             half_width(1) + 0.0025, M["purple"], ring=8, caps=False, squash=flat)
    return z + h


def mug(M, x, y, z, handle=225):
    """Mug of pencils standing on height z; the handle points `handle` degrees round."""
    lib.lathe("Mug_Body", [(0, 0), (0.034, 0), (0.038, 0.005), (0.038, 0.075),
                           (0.033, 0.075), (0.033, 0.01), (0, 0.01)], loc=(x, y, z),
              material=M["teal"], verts=12)
    hnd = lib.torus("Mug_Handle", 0.021, 0.0055, (0, 0, 0), M["teal"], seg=6, ring=5,
                    sweep=math.pi)
    kit.transform([hnd], Matrix.Translation((x, y, z + 0.04)) @
                  Matrix.Rotation(math.radians(handle), 4, "Z") @
                  Matrix.Translation((0.034, 0, 0)) @ Matrix.Rotation(math.pi / 2, 4, "X") @
                  Matrix.Rotation(-math.pi / 2, 4, "Z"))
    # Pencils stand on the mug's inner floor and lean out onto its rim.
    for i, (ang, lean, length) in enumerate(((70, 12, 0.13), (185, 11, 0.12))):
        pr, a, b = 0.0055, math.radians(ang), math.radians(lean)
        dist = 0.033 - 0.065 * math.tan(b) - pr / math.cos(b)
        foot = Vector((x + dist * math.cos(a), y + dist * math.sin(a),
                       z + 0.01 + pr * math.sin(b)))
        m = Matrix.Translation(foot) @ Matrix.Rotation(a, 4, "Z") @ \
            Matrix.Rotation(b, 4, "Y")
        stick = lib.cyl(f"Pencil{i}_Body", pr, length, (0, 0, length / 2), M["yellow"], r=0,
                        verts=6)
        tip = lib.cyl(f"Pencil{i}_Tip", pr, 0.016, (0, 0, length + 0.008), M["manila"], r=0,
                      verts=6, radius2=0.0012)
        kit.transform([stick, tip], m)


def duck(M, x, y, z, yaw=60, sink=0.004):
    """Rubber duck sitting on height z, nestled `sink` into the soft cardigan."""
    parts = [
        lib.sphere("Duck_Body", 1.0, (0, 0, 0.038), M["yellow"], scale=(0.05, 0.042, 0.038),
                   u=14, v=8),
        lib.sphere("Duck_Head", 0.03, (-0.025, 0, 0.083), M["yellow"], u=12, v=8),
        lib.sphere("Duck_Beak", 1.0, (-0.056, 0, 0.078), M["orange"],
                   scale=(0.02, 0.016, 0.008), u=8, v=4),
    ]
    for s in (-1, 1):
        parts.append(lib.sphere(f"Duck_Eye{s}", 0.0055, (-0.044, s * 0.016, 0.093), M["ink"],
                                u=6, v=3))
    kit.transform(parts, Matrix.Translation((x, y, z - sink)) @
                  Matrix.Rotation(math.radians(yaw), 4, "Z"))


def build():
    lib.begin(NAME)
    M = materials()
    box(M)
    shelf = binders(M)
    # Back left: the plant on two books. Back middle: the photo on the folders (they come
    # up to the same height), with the stapler in front of it.
    z = book("BookL1", (0.15, 0.115, 0.038), (-0.095, 0.062), shelf, M["blue"], M, yaw=4)
    z = book("BookL2", (0.135, 0.105, 0.034), (-0.098, 0.06), z, M["pink"], M, yaw=-5)
    plant(M, -0.095, 0.06, z)
    z = folders(M, (0.042, 0.066), shelf)
    photo(M, 0.031, z)
    stapler(M, 0.04, 0.045, z)
    side_books(M, shelf)
    # Front: the folded cardigan, with the mug and the duck sitting on it.
    z = cardigan(M, shelf)
    mug(M, -0.118, -0.064, z)
    duck(M, 0.035, -0.05, z)


def finalize(name):
    return kit.finalize(name, META, ao_res=512, ao_distance=0.08)
