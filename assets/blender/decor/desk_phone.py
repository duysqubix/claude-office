"""Desk phone: a chunky retro office phone. Tintable `Accent` wedge body, handset resting in
its cradle on the left with a fat coiled cord looping down to the desk and back into the
side, a 3 × 4 keypad, a little LCD reading "12:00" and a glowing red message light.
0.2 × 0.18 m; origin at the desk-contact centre; keypad towards the user (-Y)."""
import math

from mathutils import Vector

import lib
from decor import _decor as D
from decor import _gadgets as G

NAME = "desk_phone"
AO_RES = 256
AO_DISTANCE = 0.045
W, L = 0.2, 0.18
Z_FRONT, Z_BACK = 0.034, 0.068
SLOPE = math.atan2(Z_BACK - Z_FRONT, L)
HX = -0.052  # handset centre line
META = dict(
    name="Desk phone", category="desk-item", priority="P1",
    description="Chunky retro desk phone with a coiled cord, keypad and a red message light",
    tags=["desk", "office", "phone", "gadget"], tintable=["Accent"],
    anchors_bl={"handset": (HX, 0.0, 0.1)},
)


def materials():
    return dict(
        body=D.mat("Accent", "mint", rough=0.5),
        key=D.mat("Key", "white", rough=0.45),
        ink=D.mat("Ink", "ink", rough=0.6),
        bezel=D.mat("Bezel", "#2E3440", rough=0.5),
        lcd=D.mat("LCD", "#C9E4B4", rough=0.45),
        led=lib.mat("Light", "#FF5A5F", rough=0.3, emit="#FF5A5F", strength=2.0),
    )


def frame():
    """Matrix of the sloped top: z = 0 on the surface, y running up the slope."""
    return D._place((0, -L / 2, Z_FRONT), (SLOPE, 0, 0))


def body(M):
    prof = [(-L / 2, 0.0), (L / 2, 0.0), (L / 2, Z_BACK), (-L / 2, Z_FRONT)]  # (y, z)
    D.prism("Body", D.rounded_pts(prof, 0.014, steps=4), W, M["body"], loc=(-W / 2, 0, 0),
            rot=(math.pi / 2, 0, math.pi / 2), r=0.008, seg=2, angle=30)


def top(M):
    before = D.snapshot()
    # Cradle rests and the handset lying on them.
    for y in (0.04, 0.146):
        lib.rbox(f"Cradle{y}", (0.05, 0.024, 0.016), (HX, y, 0.004), M["body"], r=0.006, seg=2)
    for name, y in (("Mouth", 0.04), ("Ear", 0.146)):
        lib.sphere(f"Hs_{name}", 0.028, (HX, y, 0.0295), M["body"], scale=(1.0, 1.12, 0.62),
                   u=16, v=8)
    D.tube("Hs_Grip", [(HX, 0.14, 0.033), (HX, 0.093, 0.047), (HX, 0.046, 0.033)], 0.0135,
           M["body"], verts=10, smooth=4, caps=None)
    # Keypad on the right, display and message light behind it.
    rows = [[("*", "key", "ink"), ("0", "key", "ink"), ("#", "key", "ink")],
            [("7", "key", "ink"), ("8", "key", "ink"), ("9", "key", "ink")],
            [("4", "key", "ink"), ("5", "key", "ink"), ("6", "key", "ink")],
            [("1", "key", "ink"), ("2", "key", "ink"), ("3", "key", "ink")]]
    G.keypad(M, rows, x0=0.024, y0=0.03, pitch=(0.027, 0.022), size=(0.022, 0.016))
    lib.rbox("Lcd_Bezel", (0.078, 0.034, 0.004), (0.051, 0.136, 0.0012), M["bezel"], r=0.0035,
             seg=2)
    D.face("Lcd_Face", D.rrect_pts(0.068, 0.024, 0.003), M["lcd"], loc=(0.051, 0.137, 0.0033))
    D.text("Lcd_Time", "12:00", 0.014, M["ink"], loc=(0.051, 0.137, 0.0035), rot=(0, 0, 0),
           depth=0, res=2)
    lib.sphere("Msg_Light", 0.005, (0.082, 0.163, 0.0005), M["led"], scale=(1, 1, 0.65), u=12,
               v=6)
    D.place(D.since(before), loc=(0, -L / 2, Z_FRONT), rot=(SLOPE, 0, 0))


def cord(M):
    start = frame() @ Vector((HX, 0.012, 0.022))
    pts = [start, (-0.062, -0.108, 0.034), (-0.082, -0.126, 0.013), (-0.113, -0.104, 0.011),
           (-0.121, -0.06, 0.012), (-0.098, -0.032, 0.022)]
    G.coil("Cord", [Vector(p) for p in pts], coil_r=0.0072, wire_r=0.0024, pitch=0.0105,
           material=M["body"], samples=6, verts=5)


def build():
    lib.begin(NAME)
    M = materials()
    body(M)
    top(M)
    cord(M)


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META)
