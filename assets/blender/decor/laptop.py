"""Laptop: chunky open laptop. Tintable `Accent` shell, white keys on a dark deck, trackpad,
lid tilted back 18° with an emissive `Screen` (planar 0..1 UVs, front projection) inside a
rounded bezel, a webcam dot, and stickers on the back of the lid. 0.32 × 0.22 base;
origin at the desk-contact centre of the base; the screen faces -Y."""
import math

import lib
from decor import _decor as D

NAME = "laptop"
AO_RES = 256
AO_DISTANCE = 0.03
BW, BD, BH = 0.32, 0.22, 0.018
HINGE = (0, BD / 2 - 0.004, BH + 0.002)
TILT = math.radians(-18)  # lid top leans back (+Y)
LID_H, LID_T = 0.215, 0.011
META = dict(
    name="Laptop", category="desk-item", priority="P0",
    description="Chunky open laptop with an emissive Screen, white keys and lid stickers",
    tags=["desk", "computer", "screen"], tintable=["Accent", "Screen"],
    anchors_bl={"screenCenter": (0, 0.098, 0.13), "keyboard": (0, 0.025, BH)},
    screen=dict(width=0.282, height=0.168),
)


def materials():
    return dict(
        shell=D.mat("Accent", "lilac", rough=0.45),
        deck=D.mat("Deck", "rubber", rough=0.6),
        keys=D.mat("Keys", "white", rough=0.5),
        pad=D.mat("Trackpad", "#BCC5D3", rough=0.4),
        bezel=D.mat("Bezel", "#2E3440", rough=0.5),
        screen=lib.mat("Screen", lib.P["screenOff"], rough=0.4, emit=lib.P["screenGlow"]),
        cam=D.mat("Webcam", "eye", rough=0.2),
        coral=D.mat("StickerCoral", "coral", rough=0.6),
        mint=D.mat("StickerMint", "mint", rough=0.6),
        sun=D.mat("StickerYellow", "yellow", rough=0.6),
        cream=D.mat("StickerCream", "paper", rough=0.6),
    )


def base(M):
    lib.rbox("Base", (BW, BD, BH), (0, 0, BH / 2), M["shell"], r=0.007, seg=2)
    lib.rbox("Deck", (0.284, 0.112, 0.003), (0, 0.026, BH - 0.0005), M["deck"], r=0.0014,
             seg=1)
    pitch = 0.0272
    for row in range(3):
        for i in range(10):
            lib.rbox(f"Key{row}_{i}", (0.0215, 0.02, 0.0045),
                     ((i - 4.5) * pitch, 0.064 - row * 0.0245, BH + 0.0015), M["keys"],
                     r=0.0016, seg=1)
    for name, x, w in (("KeyL", -0.103, 0.048), ("Space", 0.0, 0.13), ("KeyR", 0.103, 0.048)):
        lib.rbox(f"Key_{name}", (w, 0.02, 0.0045), (x, 0.064 - 3 * 0.0245, BH + 0.0015),
                 M["keys"], r=0.0016, seg=1)
    lib.rbox("Trackpad", (0.095, 0.052, 0.0016), (0, -0.074, BH + 0.0002), M["pad"],
             r=0.0008, seg=1)
    lib.cyl("Hinge", 0.0075, 0.24, (0, HINGE[1] + 0.002, HINGE[2] - 0.001), M["bezel"],
            r=0.002, seg=1, verts=16, rot=(0, math.pi / 2, 0))


def lid(M):
    before = D.snapshot()
    hy, hz = HINGE[1], HINGE[2]
    cy = hy + LID_T / 2
    lib.rbox("Lid", (BW, LID_T, LID_H), (0, cy, hz + LID_H / 2), M["shell"], r=0.006, seg=2)
    lib.rbox("Lid_Bezel", (BW - 0.016, 0.004, LID_H - 0.016), (0, hy - 0.0005, hz + LID_H / 2),
             M["bezel"], r=0.008, seg=2)
    sw, sh = 0.282, 0.168
    zc = hz + LID_H / 2 + 0.006
    D.face("Screen", D.rrect_pts(sw, sh, 0.004, steps=2), M["screen"], loc=(0, hy - 0.0026, zc),
           rot=D.FRONT)
    lib.sphere("Webcam", 0.0022, (0, hy - 0.0024, hz + LID_H - 0.0125), M["cam"], u=10, v=5,
               scale=(1, 0.5, 1))
    # Stickers on the back of the lid (facing +Y).
    back = hy + LID_T + 0.0002
    away = D.BACK
    D.prism("Stk_Coral", D.circle_pts(0.03, 28), 0.0006, M["coral"],
            loc=(-0.075, back, hz + 0.13), rot=away, back=False)
    D.prism("Stk_Star", D.star_pts(5, 0.017, 0.008), 0.0004, M["cream"],
            loc=(-0.075, back + 0.0006, hz + 0.13), rot=away, back=False)
    D.prism("Stk_Mint", D.rrect_pts(0.05, 0.036, 0.009), 0.0006, M["mint"],
            loc=(0.06, back, hz + 0.075), rot=(math.pi / 2, math.radians(-12), math.pi), back=False)
    D.prism("Stk_Heart", D.heart_pts(0.034, 32), 0.0006, M["sun"],
            loc=(0.07, back, hz + 0.155), rot=(math.pi / 2, math.radians(10), math.pi), back=False)
    D.turn(D.since(before), HINGE, (TILT, 0, 0))


def build():
    lib.begin(NAME)
    M = materials()
    base(M)
    lid(M)


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META)
