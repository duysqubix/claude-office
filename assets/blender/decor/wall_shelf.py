"""Wall shelf: a chunky floating wooden shelf on two fat rounded brackets, dressed with three
leaning books, a little round-leaf plant and a tiny framed photo. 0.62 m wide; wall item:
origin at the back centre of the shelf board (the board's top is at z = +0.0175), front
looks -Y."""
import math

from mathutils import Vector

import lib
from decor import _decor as D

NAME = "wall_shelf"
AO_RES = 512
AO_DISTANCE = 0.05
SW, SD, ST = 0.62, 0.2, 0.035
TOP = ST / 2
META = dict(
    name="Wall shelf", category="decor", priority="P1",
    description="Floating wooden wall shelf with books, a little plant and a tiny photo",
    tags=["wall", "shelf", "storage"], tintable=["Accent"],
    anchors_bl={"shelfTop": (0.05, -SD / 2, TOP)}, mount="wall: origin is the back centre",
)


def materials():
    return dict(
        wood=D.mat("Accent", "wood", rough=0.55),
        bracket=D.mat("Bracket", "woodDark", rough=0.55),
        pages=D.mat("Pages", "paper2", rough=0.8),
        b1=D.mat("BookRed", "coral", rough=0.6),
        b2=D.mat("BookBlue", "blue", rough=0.6),
        b3=D.mat("BookYellow", "yellow", rough=0.6),
        pot=D.mat("Pot", "pot", rough=0.7),
        soil=D.mat("Soil", "soil", rough=0.95),
        leaf=D.mat("Leaf", "leaf", rough=0.6),
        frame=D.mat("Frame", "paper", rough=0.6),
        pic=D.mat("Pic", "sky", rough=0.6),
        hill=D.mat("PicHill", "mint", rough=0.6),
    )


def shelf(M):
    lib.rbox("Board", (SW, SD, ST), (0, -SD / 2, 0), M["wood"], r=0.008, seg=2)
    tri = D.rounded_pts([(0.0, 0.0), (-0.15, 0.0), (0.0, -0.13)], 0.018, steps=3)
    for s in (-1, 1):
        D.prism(f"Bracket{s}", tri, 0.03, M["bracket"], loc=(s * 0.21 - 0.015, -0.002, -TOP),
                rot=(math.pi / 2, 0, math.pi / 2), r=0.006, seg=2)


def books(M):
    edge = -0.26  # running left edge along the shelf
    for k, (w, h, d, key, lean) in enumerate(((0.035, 0.2, 0.15, "b1", 0), (0.03, 0.18, 0.14, "b2", 0),
                                              (0.032, 0.17, 0.14, "b3", 14))):
        before = D.snapshot()
        lib.rbox(f"Book{k}", (w, d, h), (0, 0, h / 2), M[key], r=0.004, seg=1)
        lib.rbox(f"Book{k}_Pages", (w - 0.008, d - 0.006, h - 0.012), (0, 0.005, h / 2),
                 M["pages"], r=0.002, seg=1)
        for z in (h * 0.25, h * 0.78):
            D.face(f"Book{k}_Band{z:.2f}", D.rrect_pts(w - 0.008, 0.008, 0.003, steps=1),
                   M["pages"], loc=(0, -d / 2 - 0.0004, z), rot=D.FRONT)
        objs = D.since(before)
        if lean:
            # Tips left on its bottom-left edge until its top rests on the neighbour.
            edge += h * math.sin(math.radians(lean)) + 0.002
            D.turn(objs, (-w / 2, 0, 0), (0, -math.radians(lean), 0))
        D.place(objs, loc=(edge + w / 2, -SD / 2 - 0.005, TOP))
        edge += w + 0.002


def plant(M):
    px, py = 0.07, -SD / 2
    zs = D.pot("Plant_Pot", 0.03, 0.038, 0.065, M["pot"], M["soil"], rim=0.007,
               loc=(px, py, TOP), verts=20)
    base = Vector((px, py, TOP + zs))
    for i in range(6):
        a = math.radians(30 + i * 60)
        tilt = math.radians(25 + (i % 2) * 20)
        d = Vector((math.sin(tilt) * math.cos(a), math.sin(tilt) * math.sin(a), math.cos(tilt)))
        lib.sphere(f"Plant_Leaf{i}", 1.0, tuple(base + d * 0.045), M["leaf"],
                   scale=(0.026, 0.008, 0.032), u=10, v=6, rot=d.to_track_quat("Z", "Y").to_euler())


def photo(M):
    before = D.snapshot()
    D.slab("Photo", D.rrect_pts(0.075, 0.095, 0.008), 0.012, M["frame"], rot=D.FRONT, r=0.003)
    D.face("Photo_Pic", D.rrect_pts(0.055, 0.075, 0.004), M["pic"], loc=(0, -0.0063, 0),
           rot=D.FRONT)
    D.face("Photo_Hill", [(-0.0275, -0.0375), (0.0275, -0.0375), (0.0275, -0.01), (0.0, 0.005),
                          (-0.0275, -0.015)], M["hill"], loc=(0, -0.0066, 0), rot=D.FRONT)
    D.place(D.since(before), loc=(0.2, -SD / 2 + 0.02, TOP + 0.047),
            rot=(math.radians(-10), 0, math.radians(-14)))


def build():
    lib.begin(NAME)
    M = materials()
    shelf(M)
    books(M)
    plant(M)
    photo(M)


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META, wall=True)
