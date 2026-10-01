"""Arcade cabinet: classic upright cabinet with chunky purple side panels, a glowing marquee,
a tilted screen in the emissive `Screen` material (planar 0..1 UVs), a control deck with a
ball-top joystick and fat buttons, and a coin door. Front faces -Y; origin at the floor."""
import math

import bmesh
from mathutils import Euler, Vector

import lib

NAME = "arcade_cabinet"
AO_RES = 512
W = 0.66
SCREEN_TILT = math.radians(-14)      # top leans back (+Y)
SW, SH = 0.46, 0.36
SC = Vector((0, -0.12, 1.3))         # screen centre
META = dict(
    name="Arcade cabinet", category="furniture", priority="P2",
    description="Upright arcade cabinet with glowing marquee and a game-driven screen",
    tags=["game-room", "fun", "screen"], tintable=["Screen", "Accent"],
    anchors_bl={"screenCenter": tuple(SC + Vector((0, 0.04 - 0.033, 0))), "player": (0, -0.75, 0)},
    screen=dict(width=SW, height=SH),
)

# Side profile (y, z), front is -Y.
PROFILE = [(-0.3, 0.0), (0.36, 0.0), (0.36, 1.82), (-0.26, 1.82), (-0.26, 1.58), (-0.1, 1.52),
           (-0.06, 1.08), (-0.4, 1.0), (-0.4, 0.9), (-0.3, 0.86)]


def materials():
    return dict(
        side=lib.mat("Accent", "#9B5DE5", rough=0.5),
        body=lib.mat("Body", "#2B2D42", rough=0.55),
        marquee=lib.mat("Marquee", "#FFD93D", rough=0.4, emit="#FFD93D", strength=1.5),
        letters=lib.mat("Letters", "#FF5A5F", rough=0.5),
        screen=lib.mat("Screen", lib.P["screenOff"], rough=0.4, emit=lib.P["screenGlow"]),
        stick=lib.mat("Stick", "#FF5A5F", rough=0.4),
        btn=lib.mat("Buttons", "#4D96FF", rough=0.4),
        btn2=lib.mat("Buttons2", "#6BCB77", rough=0.4),
        coin=lib.mat("Coin", "#FF9F45", rough=0.4, emit="#FF9F45", strength=1.2),
        chrome=lib.mat("Chrome", lib.P["metal"], rough=0.3, metal=0.4),
    )


def sides(M):
    side_rot = (math.pi / 2, 0, math.pi / 2)        # outline (y, z) → world, extrude along X
    for s in (-1, 1):
        x = s * (W / 2 - 0.03)
        lib.slab(f"AR_Side{s}", PROFILE, -0.03, 0.03, (x, 0, 0), M["side"], r=0.02, seg=2,
                 rot=side_rot)


def body(M):
    iw = W - 0.06
    lib.rbox("AR_Back", (iw, 0.4, 1.8), (0, 0.15, 0.9), M["body"], r=0.02, seg=1)
    lib.rbox("AR_Lower", (iw, 0.06, 0.86), (0, -0.3, 0.43), M["body"], r=0.015, seg=1)
    lib.rbox("AR_Deck", (iw + 0.02, 0.36, 0.08), (0, -0.24, 0.96), M["body"], r=0.02, seg=2,
             rot=(math.radians(8), 0, 0))
    lib.rbox("AR_Marquee", (iw, 0.06, 0.2), (0, -0.23, 1.69), M["marquee"], r=0.015, seg=1)
    lib.text("AR_Title", "PLAY!", 0.11, (0, -0.265, 1.69), M["letters"], extrude=0.004,
             bevel=0, res=2)


def screen(M):
    rot = Euler((SCREEN_TILT, 0, 0))
    lib.rbox("AR_Bezel", (W - 0.08, 0.06, 0.5), tuple(SC + Vector((0, 0.04, 0))), M["body"],
             r=0.03, seg=2, rot=tuple(rot))
    bm = bmesh.new()
    vs = [bm.verts.new(v) for v in ((-SW / 2, 0, -SH / 2), (SW / 2, 0, -SH / 2),
                                    (SW / 2, 0, SH / 2), (-SW / 2, 0, SH / 2))]
    bm.faces.new(vs)
    # Sit the screen just proud of the bezel's tilted front face.
    bezel_c = SC + Vector((0, 0.04, 0))
    front = rot.to_matrix() @ Vector((0, -1, 0))
    lib._link("AR_Screen", bm, M["screen"], loc=tuple(bezel_c + front * 0.033),
              rot=tuple(rot))


def controls(M):
    z = 1.02
    lib.cyl("AR_StickBase", 0.035, 0.015, (-0.14, -0.28, z), M["chrome"], r=0.005, seg=1,
            verts=14)
    lib.cyl("AR_Stick", 0.01, 0.07, (-0.14, -0.28, z + 0.04), M["chrome"], r=0, verts=8)
    lib.sphere("AR_StickBall", 0.03, (-0.14, -0.28, z + 0.08), M["stick"], u=14, v=7)
    for i in range(4):
        mat = M["btn"] if i % 2 == 0 else M["btn2"]
        lib.cyl(f"AR_Btn{i}", 0.022, 0.025, (0.04 + (i % 2) * 0.06, -0.3 + (i // 2) * 0.06,
                z + 0.01), mat, r=0.008, seg=1, verts=14)
    lib.rbox("AR_CoinDoor", (0.22, 0.02, 0.26), (0, -0.335, 0.55), M["chrome"], r=0.015, seg=1)
    for s in (-1, 1):
        lib.rbox(f"AR_Coin{s}", (0.03, 0.012, 0.05), (s * 0.05, -0.348, 0.6), M["coin"],
                 r=0.004, seg=1)


STEPS = [sides, body, screen, controls]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
