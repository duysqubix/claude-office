"""Cork board: a warm cork pinboard in a fat round wooden frame, covered in pinned-up
office life: a yellow TODO note, a pink heart note, a polaroid, a lined index card and a
blue memo, each held by a chunky coloured push pin. 0.9 × 0.62 m; wall item: origin at the
back centre, face looks -Y."""
import math

import lib
from decor import _decor as D
from decor import _wall as Wl

NAME = "cork_board"
AO_RES = 512
AO_DISTANCE = 0.04
W, H = 0.86, 0.58
META = dict(
    name="Cork board", category="decor", priority="P1",
    description="Cork pinboard with notes, a polaroid and an index card on coloured push pins",
    tags=["wall", "notes", "office"], tintable=["Accent"],
    anchors_bl={"center": (0, -0.03, 0)}, mount="wall: origin is the back centre",
)


def materials():
    return dict(
        cork=D.mat("Cork", "cork", rough=0.9),
        frame=D.mat("Accent", "wood", rough=0.6),
        paper=D.mat("Paper", "paper", rough=0.8),
        yellow=D.mat("NoteYellow", "#FFE680", rough=0.8),
        pink=D.mat("NotePink", "#FFB3D1", rough=0.8),
        blue=D.mat("NoteBlue", "#BFE3FF", rough=0.8),
        ink=D.mat("Ink", "ink", rough=0.6),
        line=D.mat("Line", "#AEB6C6", rough=0.8),
        red=D.mat("Red", "red", rough=0.5),
        sky=D.mat("PhotoSky", "#7CCBFF", rough=0.6),
        hill=D.mat("PhotoHill", "mint", rough=0.6),
        sun=D.mat("PhotoSun", "yellow", rough=0.5),
        pinR=D.mat("PinRed", "coral", rough=0.35),
        pinB=D.mat("PinBlue", "blue", rough=0.35),
        pinG=D.mat("PinGreen", "mint", rough=0.35),
        pinY=D.mat("PinYellow", "yellow", rough=0.35),
    )


def note(name, M, key, w, h, x, z, spin, face, pin, extras=None, s=1.3):
    """A paper item lying on the cork (drawn at 1/s scale, then scaled up by s), spun a
    little, with a push pin at its top."""
    before = D.snapshot()
    lib.rbox(f"{name}", (w, 0.003, h), (0, -0.0015, 0), M[key], r=0.001, seg=1)
    if extras:
        extras(-0.003)
    lib.cyl(f"{name}_PinBase", 0.0105, 0.006, (0, -0.0055, h / 2 - 0.016), M[pin], r=0.0025,
            seg=1, verts=14, rot=(math.pi / 2, 0, 0))
    lib.sphere(f"{name}_PinHead", 0.0085, (0, -0.012, h / 2 - 0.016), M[pin], u=12, v=6,
               scale=(1, 0.8, 1))
    D.place(D.since(before), loc=(x, face, z), rot=(0, math.radians(spin), 0), scale=s)


def build():
    lib.begin(NAME)
    M = materials()
    face = Wl.framed("Board", W, H, M["cork"], M["frame"], tube=0.024)

    def todo(y):
        D.text("Todo_Txt", "TODO", 0.02, M["ink"], loc=(0, y - 0.0003, 0.028), depth=0, res=2)
        for i, w in enumerate((0.07, 0.06, 0.075)):
            D.face(f"Todo_L{i}", D.rrect_pts(w, 0.006, 0.003, steps=1), M["ink"],
                   loc=(0, y - 0.0003, 0.002 - i * 0.02), rot=D.FRONT)

    def heart(y):
        D.face("Heart", D.heart_pts(0.05, 24), M["red"], loc=(0, y - 0.0003, -0.008), rot=D.FRONT)

    def polaroid(y):
        D.face("Pol_Sky", D.rrect_pts(0.1, 0.09, 0.002, steps=1), M["sky"],
               loc=(0, y - 0.0003, 0.012), rot=D.FRONT)
        D.face("Pol_Hill", [(-0.05, -0.033), (0.05, -0.033), (0.05, -0.005), (0.015, 0.01),
                            (-0.02, -0.012), (-0.05, -0.002)], M["hill"], loc=(0, y - 0.0006, 0.0),
               rot=D.FRONT)
        D.face("Pol_Sun", D.circle_pts(0.012, 14), M["sun"], loc=(0.022, y - 0.0006, 0.035),
               rot=D.FRONT)

    def card(y):
        D.face("Card_Head", D.rrect_pts(0.15, 0.005, 0.0025, steps=1), M["red"],
               loc=(0, y - 0.0003, 0.026), rot=D.FRONT)
        for i in range(3):
            D.face(f"Card_L{i}", D.rrect_pts(0.15, 0.003, 0.0015, steps=1), M["line"],
                   loc=(0, y - 0.0003, 0.006 - i * 0.017), rot=D.FRONT)

    def memo(y):
        for i, w in enumerate((0.08, 0.1, 0.06, 0.09)):
            D.face(f"Memo_L{i}", D.rrect_pts(w, 0.006, 0.003, steps=1), M["ink"],
                   loc=(-0.045 + w / 2, y - 0.0003, 0.03 - i * 0.022), rot=D.FRONT)

    note("Note_Todo", M, "yellow", 0.11, 0.11, -0.29, 0.1, -7, face, "pinR", todo)
    note("Note_Heart", M, "pink", 0.1, 0.1, 0.3, -0.12, 6, face, "pinB", heart)
    note("Polaroid", M, "paper", 0.12, 0.14, -0.08, 0.08, 4, face, "pinY", polaroid)
    note("Card", M, "paper", 0.18, 0.11, 0.2, 0.13, -3, face, "pinG", card)
    note("Memo", M, "blue", 0.13, 0.13, -0.25, -0.13, 9, face, "pinB", memo)
    note("Receipt", M, "paper", 0.07, 0.15, 0.05, -0.12, -5, face, "pinR")


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META, wall=True)
