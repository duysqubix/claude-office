"""Photo frame: chunky rounded desk frame (tintable `Accent`) leaning back on a cardboard
easel stand. The recessed photo is a sunny day: two little round-headed people on a green
hill under a yellow sun. 0.13 × 0.165 m; origin under the frame's bottom edge; the photo
faces -Y."""
import math

from mathutils import Matrix, Vector

import lib
from decor import _decor as D
from decor import _desk as K

NAME = "photo_frame"
AO_RES = 256
AO_DISTANCE = 0.025
FW, FH, FD = 0.13, 0.165, 0.018
IW, IH = 0.088, 0.122
TILT = math.radians(-12)  # the top leans back (+Y)
PIVOT = Vector((0, -FD / 2, 0))  # the frame tips back about its bottom-front edge
META = dict(
    name="Photo frame", category="desk-item", priority="P1",
    description="Chunky desk photo frame on an easel stand; a sunny photo of two little people",
    tags=["desk", "clutter", "personal"], tintable=["Accent"],
    anchors_bl={"photoCenter": (0, -0.012, 0.082)},
)


def materials():
    return dict(
        frame=D.mat("Accent", "yellow", rough=0.45),
        back=D.mat("Backing", "#E9DCC4", rough=0.8),
        sky=D.mat("PhotoSky", "#9FD8FF", rough=0.6),
        hill=D.mat("PhotoHill", "mint", rough=0.6),
        sun=D.mat("PhotoSun", "#FFD84D", rough=0.6),
        skin=D.mat("PhotoSkin", "#FFDDBB", rough=0.6),
        coral=D.mat("PhotoShirtA", "coral", rough=0.6),
        blue=D.mat("PhotoShirtB", "blue", rough=0.6),
        ink=D.mat("PhotoInk", "ink", rough=0.6),
    )


def frame(M):
    """The upright frame, front facing -Y, bottom edge on z = 0 (tilted back afterwards)."""
    zc = FH / 2
    K.hollow_prism("Frame", D.rrect_pts(FW, FH, 0.018, steps=4), D.rrect_pts(IW, IH, 0.006, steps=4),
                   FD, M["frame"], loc=(0, FD / 2, zc), rot=D.FRONT, r=0.004, seg=2)
    lib.rbox("Frame_Back", (IW + 0.012, 0.006, IH + 0.012), (0, 0.003, zc), M["back"], r=0.002,
             seg=1)
    # The photo, layered just in front of the backing board.
    def lay(name, outline, mat, x, z, layer):
        D.face(name, outline, mat, loc=(x, -0.0005 * layer, zc + z), rot=D.FRONT)

    lay("Ph_Sky", D.rrect_pts(IW, IH, 0.004), M["sky"], 0, 0, 1)
    lay("Ph_Sun", D.circle_pts(0.012, 18), M["sun"], 0.022, 0.036, 2)
    lay("Ph_Hill", [(-IW / 2, -IH / 2), (IW / 2, -IH / 2), (IW / 2, -0.012), (0.026, -0.004),
                    (0.004, -0.012), (-0.02, -0.022), (-IW / 2, -0.014)], M["hill"], 0, 0, 2)
    for name, x, zb, w, h, hr, shirt in (("A", -0.017, -0.026, 0.024, 0.03, 0.011, "coral"),
                                         ("B", 0.016, -0.033, 0.019, 0.023, 0.0088, "blue")):
        lay(f"Ph_Body{name}", D.rrect_pts(w, h, w * 0.45), M[shirt], x, zb, 3)
        hz = zb + h / 2 + hr * 0.75
        lay(f"Ph_Head{name}", D.circle_pts(hr, 18), M["skin"], x, hz, 4)
        for s in (-1, 1):
            lay(f"Ph_Eye{name}{s}", D.circle_pts(hr * 0.13, 8), M["ink"], x + s * hr * 0.36,
                hz + hr * 0.08, 5)


def stand(M):
    """Easel leg from the back of the (tilted) frame down to the desk behind it."""
    top = Vector((0, FD / 2 + 0.002, FH * 0.62))
    p0 = PIVOT + Matrix.Rotation(TILT, 3, "X") @ (top - PIVOT)
    p1 = Vector((0, p0.y + 0.075, 0.0035))
    d = p1 - p0
    lib.rbox("Stand", (0.034, 0.005, d.length), tuple((p0 + p1) / 2), M["back"], r=0.002, seg=1,
             rot=K.aim(d))


def build():
    lib.begin(NAME)
    M = materials()
    frame(M)
    D.turn(D.since(set()), PIVOT, (TILT, 0, 0))
    stand(M)


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META)
