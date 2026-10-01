"""NOW HIRING! sign: a chunky A-frame sandwich board. Rounded wooden frames, cream panels,
bright red rounded lettering on both faces, a fat hinge on top. Origin at the floor centre;
one face looks -Y, the other +Y."""
import math

from mathutils import Vector

import lib

NAME = "now_hiring_sign"
AO_RES = 512
TILT = math.radians(13)
H = 0.92          # board length along its slope
META = dict(
    name="NOW HIRING! sign", category="decor", priority="P0",
    description="A-frame sandwich board shouting NOW HIRING! on both sides",
    tags=["reception", "sign", "text"], tintable=[], anchors_bl={},
)


def materials():
    return dict(
        wood=lib.mat("Wood", lib.P["wood"], rough=0.65),
        panel=lib.mat("Panel", lib.P["paper"], rough=0.8),
        red=lib.mat("Lettering", "#E63946", rough=0.5),
        star=lib.mat("Star", lib.P["stateNeedsYou"], rough=0.5),
    )


def board(M, side):
    """side = -1 for the front board (faces -Y), +1 for the back board (faces +Y)."""
    tag = "F" if side < 0 else "B"
    rx = -TILT if side < 0 else TILT          # tops lean in toward each other
    zc = H / 2 * math.cos(TILT)
    yc = side * H / 2 * math.sin(TILT)
    rot = (rx, 0, 0 if side < 0 else math.pi)
    rot_frame = (rx, 0, 0)
    lib.rbox(f"Sign_Frame{tag}", (0.64, 0.045, H), (0, yc, zc), M["wood"], r=0.02, seg=2,
             rot=rot_frame)
    # Panel and lettering sit proud of the outer face, along the board normal.
    n = Vector((0, side * math.cos(TILT), math.sin(TILT)))
    c = Vector((0, yc, zc + 0.05))
    lib.rbox(f"Sign_Panel{tag}", (0.54, 0.02, 0.62), tuple(c + n * 0.024), M["panel"], r=0.01,
             seg=2, rot=rot_frame)
    lib.text(f"Sign_Text{tag}", "NOW\nHIRING!", 0.13, tuple(c + n * 0.036), M["red"],
             rot=(math.pi / 2 + rx * (1 if side < 0 else -1), 0, rot[2]), extrude=0.005,
             bevel=0, res=2)
    lib.sphere(f"Sign_Star{tag}", 0.035, tuple(c + n * 0.03 + Vector((0.2, 0, -0.26))),
               M["star"], scale=(1, 0.35, 1), u=12, v=6)


def boards(M):
    board(M, -1)
    board(M, 1)


def hinge(M):
    lib.cyl("Sign_Hinge", 0.03, 0.62, (0, 0, H * math.cos(TILT) + 0.005), M["wood"], r=0.012,
            seg=2, verts=16, rot=(0, math.pi / 2, 0))


STEPS = [boards, hinge]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
