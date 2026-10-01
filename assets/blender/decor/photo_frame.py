"""Photo frame: chunky desk frame (tintable `Accent`) on a back kickstand, holding a sweet
"us" photo: two big-headed blob people under a sun with a heart between them. 0.13 ×
0.17 m, leaning back 12°; origin at the desk-contact centre; the photo faces -Y."""
import math

import lib
from decor import _decor as D

NAME = "photo_frame"
AO_RES = 256
AO_DISTANCE = 0.03
FW, FH, FT = 0.13, 0.17, 0.016
LEAN = math.radians(-12)
META = dict(
    name="Photo frame", category="desk-item", priority="P1",
    description="Desk photo frame with a cute photo of two people under a sun",
    tags=["desk", "personal", "clutter"], tintable=["Accent"],
    anchors_bl={},
)


def materials():
    return dict(
        frame=D.mat("Accent", "coral", rough=0.5),
        mat=D.mat("PhotoMat", "paper", rough=0.7),
        sky=D.mat("PhotoSky", "#9FD8FF", rough=0.6),
        hill=D.mat("PhotoHill", "mint", rough=0.6),
        sun=D.mat("PhotoSun", "yellow", rough=0.6),
        skin=D.mat("PhotoSkin", "#F7C59F", rough=0.6),
        shirtA=D.mat("PhotoShirtA", "blue", rough=0.6),
        shirtB=D.mat("PhotoShirtB", "orange", rough=0.6),
        ink=D.mat("PhotoInk", "eye", rough=0.6),
        heart=D.mat("PhotoHeart", "red", rough=0.6),
    )


def photo(M):
    """Flat picture layers stacked a hair apart in front of the frame's face."""
    y = -FT / 2 - 0.0004
    pw, ph = FW - 0.036, FH - 0.036
    D.face("Ph_Sky", D.rrect_pts(pw, ph, 0.004), M["sky"], loc=(0, y, 0), rot=D.FRONT)
    D.face("Ph_Hill", [(-pw / 2, -ph / 2), (pw / 2, -ph / 2), (pw / 2, -0.012), (0.02, 0.0),
                       (-0.01, -0.016), (-pw / 2, -0.004)], M["hill"], loc=(0, y - 0.0003, 0),
           rot=D.FRONT)
    D.face("Ph_Sun", D.circle_pts(0.011, 16), M["sun"], loc=(0.028, y - 0.0003, 0.043),
           rot=D.FRONT)
    for k, (x, shirt, h) in enumerate(((-0.019, "shirtA", 1.0), (0.019, "shirtB", 0.9))):
        yy = y - 0.0006
        D.face(f"Ph_Body{k}", D.rrect_pts(0.026 * h, 0.034 * h, 0.009), M[shirt],
               loc=(x, yy, -0.04 + 0.017 * h), rot=D.FRONT)
        hz = -0.04 + 0.034 * h + 0.012 * h
        D.face(f"Ph_Head{k}", D.circle_pts(0.0135 * h, 18), M["skin"], loc=(x, yy - 0.0003, hz),
               rot=D.FRONT)
        for s in (-1, 1):
            D.face(f"Ph_Eye{k}{s}", D.circle_pts(0.0018, 8), M["ink"],
                   loc=(x + s * 0.0045 * h, yy - 0.0006, hz + 0.001), rot=D.FRONT)
    D.face("Ph_Heart", D.heart_pts(0.014, 24), M["heart"], loc=(0, y - 0.0006, 0.022),
           rot=D.FRONT)


def build():
    lib.begin(NAME)
    M = materials()
    before = D.snapshot()
    outer = D.rrect_pts(FW, FH, 0.016)
    D.slab("Frame", outer, FT, M["frame"], rot=D.FRONT, r=0.004, seg=2)
    D.face("Mat", D.rrect_pts(FW - 0.024, FH - 0.024, 0.006), M["mat"],
           loc=(0, -FT / 2 - 0.0002, 0), rot=D.FRONT)
    photo(M)
    # Lean the frame back on its bottom edge; the kickstand props it from behind.
    D.place(D.since(before), loc=(0, 0, FH / 2 - 0.004))
    D.turn(D.since(before), (0, 0, 0.0), (LEAN, 0, 0))
    lib.rbox("Stand", (0.03, 0.006, 0.11), (0, 0.042, 0.05), M["frame"], r=0.0025, seg=1,
             rot=(math.radians(32), 0, 0))
    D.ground()


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META)
