"""Held laptop, intern-sized: a chunky rounded silver laptop (`Accent`, tint it for pastel
laptops) open about 105°, fat chamfered keys, a trackpad, a glowing `Screen` facing the
holder (planar UVs mirrored so the game's canvas reads right from behind it) and stickers
on the lid back. Pivot = the base's bottom centre, where it rests on the hands; anchors
handL / handR are where the mitten centres go. The holder stands at +Y; front faces -Y."""
import math

from characters import _kit as kit

import lib

NAME = "held_laptop"
W, D, H = 0.34, 0.23, 0.026   # base
LID_H, LID_T, TILT = 0.22, 0.016, math.radians(15)
HINGE = (0, -D / 2 + 0.006, H)
META = dict(
    name="Laptop (held)", category="character-held", priority="P0",
    description="Tiny chunky laptop with stickers, carried open on the hands; Screen faces the holder",
    tags=["held", "intern", "laptop", "screen"], tintable=["Accent"],
    anchors_bl={"handGrip": (0, 0, 0), "handL": (0.12, 0.05, -0.045),
                "handR": (-0.12, 0.05, -0.045),
                "screen": (0, HINGE[1] - math.sin(TILT) * LID_H / 2 + 0.01,
                           H + math.cos(TILT) * LID_H / 2)},
)


def materials():
    return dict(
        shell=kit.m_accent("#C8D0DC", rough=0.45),
        keys=kit.flat("Keys", "#3B4252", rough=0.7),
        deck=kit.flat("Deck", "#2E3440", rough=0.75),
        pad=kit.flat("Trackpad", "#AEB7C4", rough=0.5),
        screen=lib.mat("Screen", lib.P["screenGlow"], rough=0.3, emit=lib.P["screenGlow"],
                       strength=1.2),
        logo=kit.flat("Logo", kit.COL["claude"], rough=0.5),
        sticker1=kit.flat("StickerPink", "#FF7EB6", rough=0.55),
        sticker2=kit.flat("StickerYellow", "#FFD93D", rough=0.55),
        sticker3=kit.flat("StickerMint", "#6EDC9A", rough=0.55),
    )


def base(M):
    lib.rbox("Base", (W, D, H), (0, 0, H / 2), M["shell"], r=0.011, seg=2)
    lib.rbox("Deck", (W - 0.04, 0.115, 0.006), (0, -0.04, H - 0.0015), M["deck"], r=0.003,
             seg=1)
    kw, kd, gap = 0.029, 0.024, 0.0045
    for row in range(3):
        y = -0.083 + row * (kd + gap)
        for i in range(8):
            x = (i - 3.5) * (kw + gap)
            lib.rbox(f"Key{row}{i}", (kw, kd, 0.007), (x, y, H + 0.002), M["keys"], r=0.0025,
                     seg=1)
    lib.rbox("Space", (0.13, kd, 0.007), (0, -0.083 + 3 * (kd + gap), H + 0.002), M["keys"],
             r=0.0025, seg=1)
    lib.rbox("Trackpad", (0.1, 0.05, 0.003), (0, 0.072, H), M["pad"], r=0.006, seg=1)
    lib.cyl("Hinge", 0.008, W - 0.06, HINGE, M["deck"], r=0.003, seg=1, verts=12,
            rot=(0, math.pi / 2, 0))


def lid(M):
    hx, hy, hz = HINGE
    up = (0.0, -math.sin(TILT), math.cos(TILT))   # leans away from the holder
    out = (0.0, math.cos(TILT), math.sin(TILT))   # the screen side's normal (toward holder)
    rot = (TILT, 0, 0)

    def at(along, off):
        return (hx, hy + up[1] * along + out[1] * off, hz + up[2] * along + out[2] * off)

    lib.rbox("Lid", (W, LID_T, LID_H), at(LID_H / 2, -0.004), M["shell"], r=0.008, seg=2,
             rot=rot)
    lib.rbox("Screen", (W - 0.04, 0.003, LID_H - 0.045), at(LID_H / 2 + 0.004, LID_T / 2 - 0.004),
             M["screen"], r=0.004, seg=1, rot=rot)
    # Stickers on the lid back (it faces forward, -Y).
    back = -LID_T / 2 - 0.0045
    lib.cyl("Logo", 0.026, 0.004, at(LID_H / 2 + 0.01, back), M["logo"], r=0.0015, seg=1,
            verts=18, rot=(TILT + math.pi / 2, 0, 0))
    lib.rbox("Sticker1", (0.04, 0.003, 0.03), at(0.05, back + 0.0003), M["sticker1"], r=0.006,
             seg=1, rot=(TILT, 0, math.radians(-12)))
    x0 = 0.1
    s2 = lib.cyl("Sticker2", 0.016, 0.003, at(0.16, back + 0.0003), M["sticker2"], r=0.001,
                 seg=1, verts=14, rot=(TILT + math.pi / 2, 0, 0))
    s2.location.x = x0
    s3 = lib.rbox("Sticker3", (0.034, 0.003, 0.022), at(0.07, back + 0.0003), M["sticker3"],
                  r=0.007, seg=1, rot=(TILT, 0, math.radians(8)))
    s3.location.x = -0.1


def build():
    lib.begin(NAME)
    M = materials()
    base(M)
    lid(M)


def finalize(name):
    return kit.finalize(name, META, ao_distance=0.05, screen_back=True, preview_yaw=-150)
