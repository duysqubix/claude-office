"""Wall calendar: hangs from a nail on a string. Wire-bound paper calendar with a pumpkin
picture up top and an "OCTOBER" page below: a 7×5 grid of day squares, one circled in red,
a few with event dots and one with a heart. 0.34 × 0.5 m; wall item: origin at the back
centre, face looks -Y."""
import math

import lib
from decor import _decor as D

NAME = "calendar_wall"
AO_RES = 512
AO_DISTANCE = 0.03
W, H, T = 0.34, 0.5, 0.006
# The print stands off the page in layers this far apart: the picture, cells and month on the
# page, then the hill, sun, today ring, events and heart on top of those. Any closer and the
# game can't tell the layers apart from across the office, so the page shimmers through.
PRINT = 0.0025
META = dict(
    name="Wall calendar", category="decor", priority="P1",
    description="Wire-bound wall calendar with a pumpkin picture and an OCTOBER page",
    tags=["wall", "time", "paper"], tintable=[],
    anchors_bl={"center": (0, -0.01, 0)}, mount="wall: origin is the back centre",
    notes="Fixed by flicker: the printed layers stand 2.5 mm apart (were 0.3 mm), so the page "
          "and the sky no longer shimmer through the print from across the office.",
)


def materials():
    return dict(
        paper=D.mat("Paper", "paper", rough=0.8),
        cell=D.mat("Cell", "#E6EAF2", rough=0.8),
        sky=D.mat("PicSky", "#9FD8FF", rough=0.7),
        hill=D.mat("PicHill", "#F2C14E", rough=0.7),
        pumpkin=D.mat("Pumpkin", "orange", rough=0.6),
        stem=D.mat("Stem", "#4DBB63", rough=0.6),
        red=D.mat("Red", "red", rough=0.6),
        ink=D.mat("Ink", "ink", rough=0.6),
        wire=D.mat("Wire", "chrome", rough=0.3, metal=0.4),
        dotA=D.mat("DotBlue", "sky", rough=0.6),
        dotB=D.mat("DotMint", "mint", rough=0.6),
    )


def page(M):
    lib.rbox("Page", (W, T, H), (0, -T / 2, 0), M["paper"], r=0.002, seg=1)
    face = -T
    # Top picture: autumn hill with a pumpkin.
    pz, pw, ph = 0.115, W - 0.03, 0.2
    D.face("Pic_Sky", D.rrect_pts(pw, ph, 0.006), M["sky"], loc=(0, face - PRINT, pz),
           rot=D.FRONT)
    D.face("Pic_Hill", [(-pw / 2, pz - ph / 2), (pw / 2, pz - ph / 2), (pw / 2, pz - 0.035),
                        (0.06, pz - 0.02), (-0.05, pz - 0.045), (-pw / 2, pz - 0.03)], M["hill"],
           loc=(0, face - 2 * PRINT, 0), rot=D.FRONT)
    for k, (dx, sx) in enumerate(((-0.022, 0.75), (0.022, 0.75), (0.0, 1.0))):
        D.prism(f"Pumpkin{k}", D.circle_pts(0.042, 24, sx=sx, sy=0.78), 0.008 + 0.002 * k,
                M["pumpkin"], loc=(dx, face - 0.0006, pz - 0.04), rot=D.FRONT, r=0.003)
    D.prism("Pumpkin_Stem", D.rrect_pts(0.011, 0.024, 0.004), 0.008, M["stem"],
            loc=(0.002, face - 0.0006, pz + 0.002), rot=(math.pi / 2, math.radians(-12), 0),
            r=0.002)
    D.face("Sun", D.circle_pts(0.018, 16), M["paper"], loc=(0.1, face - 2 * PRINT, pz + 0.06),
           rot=D.FRONT)
    # Month page.
    D.text("Month", "OCTOBER", 0.03, M["red"], loc=(0, face - PRINT, -0.03), depth=0, res=2)
    cw, ch, gx, gz = 0.036, 0.03, 0.043, 0.037
    for row in range(5):
        for col in range(7):
            x = (col - 3) * gx
            z = -0.075 - row * gz
            D.face(f"Cell{row}{col}", D.rrect_pts(cw, ch, 0.004, steps=1), M["cell"],
                   loc=(x, face - PRINT, z), rot=D.FRONT)
    # Today's circled, some events, a birthday heart.
    D.ring("Today", 0.022, 0.0175, M["red"], n=20,
           loc=(1 * gx, face - 2 * PRINT, -0.075 - 1 * gz), rot=D.FRONT)
    for k, (r, c, key) in enumerate(((0, 4, "dotA"), (2, 1, "dotB"), (3, 5, "dotA"), (4, 2, "dotB"))):
        D.face(f"Event{k}", D.circle_pts(0.006, 10), M[key],
               loc=((c - 3) * gx, face - 2 * PRINT, -0.075 - r * gz), rot=D.FRONT)
    D.face("Birthday", D.heart_pts(0.018, 20), M["red"],
           loc=(-1 * gx, face - 2 * PRINT, -0.075 - 3 * gz), rot=D.FRONT)


def binding(M):
    top = H / 2
    lib.rbox("Bind_Strip", (W, 0.01, 0.014), (0, -T - 0.004, top - 0.008), M["ink"], r=0.003,
             seg=1)
    for k in range(10):
        x = (k - 4.5) * 0.031
        # Loops pass through the page but stop at the wall (y <= 0).
        lib.torus(f"Bind_Coil{k}", 0.0075, 0.0016, (x, -0.0095, top - 0.003), M["wire"],
                  seg=12, ring=4, rot=(0, math.pi / 2, 0))
    # String up to a nail in the wall.
    nz = top + 0.07
    lib.cyl("Nail", 0.0035, 0.016, (0, -0.008, nz), M["wire"], r=0.001, seg=1, verts=8,
            rot=(math.pi / 2, 0, 0))
    lib.cyl("Nail_Head", 0.0065, 0.003, (0, -0.0165, nz), M["wire"], r=0.001, seg=1, verts=12,
            rot=(math.pi / 2, 0, 0))
    D.tube("String", [(-0.11, -0.006, top - 0.004), (0, -0.012, nz + 0.003),
                      (0.11, -0.006, top - 0.004)], 0.0013, M["ink"], verts=5, caps="round")


def build():
    lib.begin(NAME)
    M = materials()
    page(M)
    binding(M)


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META, wall=True)
