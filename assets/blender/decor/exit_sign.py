"""Exit sign: chunky wall-mounted box sign with a glowing green face (emissive `Glow`), a
running figure, raised "EXIT" and an arrow, all in glowing white. 0.38 × 0.16 m; wall
item: origin at the back centre, face looks -Y."""
import math

import lib
from decor import _decor as D

NAME = "exit_sign"
AO_RES = 256
AO_DISTANCE = 0.03
BW, BD, BH = 0.38, 0.06, 0.16
META = dict(
    name="Exit sign", category="decor", priority="P1",
    description="Glowing green EXIT sign with a running figure and an arrow",
    tags=["wall", "sign", "glow", "door"], tintable=[],
    anchors_bl={"center": (0, -BD, 0)}, mount="wall: origin is the back centre; hang above doors",
)


def materials():
    return dict(
        box=D.mat("Housing", "paper2", rough=0.5),
        glow=lib.mat("Glow", "#20B866", rough=0.4, emit="#2BD67B", strength=1.4),
        white=lib.mat("GlowWhite", "#FFFFFF", rough=0.4, emit="#F4FFF8", strength=1.2),
    )


def figure(M, y, cx, cz):
    """Running pictogram: tubes lying on the face."""
    r = 0.0055
    pts = {
        "torso": [(cx + 0.004, cz + 0.016), (cx - 0.004, cz - 0.01)],
        "armF": [(cx + 0.003, cz + 0.012), (cx + 0.016, cz + 0.004), (cx + 0.026, cz + 0.012)],
        "armB": [(cx + 0.002, cz + 0.012), (cx - 0.012, cz + 0.008), (cx - 0.02, cz - 0.002)],
        "legF": [(cx - 0.004, cz - 0.01), (cx + 0.01, cz - 0.02), (cx + 0.012, cz - 0.036)],
        "legB": [(cx - 0.004, cz - 0.01), (cx - 0.016, cz - 0.022), (cx - 0.03, cz - 0.022)],
    }
    for k, p in pts.items():
        D.tube(f"Fig_{k}", [(x, y, z) for x, z in p], r, M["white"], verts=6, caps="round")
    lib.sphere("Fig_Head", 0.0085, (cx + 0.009, y, cz + 0.03), M["white"], u=12, v=6,
               scale=(1, 0.5, 1))


def build():
    lib.begin(NAME)
    M = materials()
    lib.rbox("Housing", (BW, BD, BH), (0, -BD / 2, 0), M["box"], r=0.014, seg=2)
    fy = -BD - 0.0003
    D.face("Glow", D.rrect_pts(BW - 0.03, BH - 0.03, 0.012), M["glow"], loc=(0, fy, 0),
           rot=D.FRONT)
    D.text("Exit", "EXIT", 0.068, M["white"], loc=(0.035, fy, 0), depth=0.005, res=2)
    figure(M, fy - 0.003, -0.115, 0.0)
    arrow = [(-0.022, 0.009), (0.004, 0.009), (0.004, 0.02), (0.026, 0.0), (0.004, -0.02),
             (0.004, -0.009), (-0.022, -0.009)]
    D.prism("Arrow", D.rounded_pts(arrow, 0.003, steps=2), 0.005, M["white"],
            loc=(0.15, fy, 0), rot=D.FRONT, r=0.0015, seg=1)


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META, wall=True)
