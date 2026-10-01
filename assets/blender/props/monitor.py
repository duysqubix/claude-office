"""Monitor: chunky rounded bezel with a rear hump, fat neck and round foot. The screen is a
flat quad with the emissive `Screen` material and planar 0..1 UVs (the game swaps a canvas
texture onto it). Origin at the centre of the foot on the desk surface; screen faces -Y."""
import bmesh

import lib

NAME = "monitor"
AO_RES = 256
SCREEN_W, SCREEN_H, SCREEN_Z = 0.53, 0.35, 0.40
META = dict(
    name="Monitor", category="desk-item", priority="P0",
    description="Chunky toy monitor with a thick rounded bezel and a swappable glowing screen",
    tags=["desk", "computer", "screen"], tintable=["Screen"],
    anchors_bl={"screenCenter": (0, -0.056, SCREEN_Z)},
    screen=dict(width=SCREEN_W, height=SCREEN_H),
)


def materials():
    return dict(
        bezel=lib.mat("Bezel", lib.P["monitorBezel"], rough=0.55),
        screen=lib.mat("Screen", lib.P["screenOff"], rough=0.4, emit=lib.P["screenGlow"]),
    )


def parts(M, at=(0, 0, 0)):
    x, y, z = at
    by = y - 0.12  # bezel centre sits in front of the foot
    lib.cyl("Mon_Foot", 0.13, 0.035, (x, y + 0.02, z + 0.0175), M["bezel"], r=0.014, seg=2,
            verts=28)
    lib.rbox("Mon_Neck", (0.10, 0.06, 0.20), (x, y + 0.07, z + 0.12), M["bezel"], r=0.026,
             seg=2)
    lib.rbox("Mon_Bezel", (0.62, 0.11, 0.44), (x, by + 0.12, z + SCREEN_Z), M["bezel"],
             r=0.055, seg=4)
    lib.rbox("Mon_Hump", (0.42, 0.14, 0.30), (x, by + 0.20, z + SCREEN_Z), M["bezel"], r=0.06,
             seg=3)
    w, h = SCREEN_W, SCREEN_H
    bm = bmesh.new()
    vs = [bm.verts.new(v) for v in ((-w / 2, 0, -h / 2), (w / 2, 0, -h / 2),
                                    (w / 2, 0, h / 2), (-w / 2, 0, h / 2))]
    bm.faces.new(vs)  # normal faces -Y
    lib._link("Mon_Screen", bm, M["screen"], loc=(x, by + 0.12 - 0.056, z + SCREEN_Z))


def build():
    lib.begin(NAME)
    parts(materials())


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
