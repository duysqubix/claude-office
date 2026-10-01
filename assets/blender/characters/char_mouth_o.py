"""Mouth, O: a round open "oh!" (surprise, alerts, singing, yawning), a dark oval
domed very slightly off the face with a little tongue at the bottom. `Mouth` + `Tongue`.
Pivot at the head centre."""
from characters import _kit as kit

import lib

NAME = "char_mouth_o"
CX, CY = 0.0, -0.096
META = dict(
    name="Mouth: O", category="character-face", priority="P0",
    description="Round open mouth with a little tongue (surprise / alert)",
    tags=["face", "mouth", "expression", "surprised"], tintable=[],
    anchors_bl={"mouth": tuple(kit.face_point(CX, CY))},
)


def build():
    lib.begin(NAME)
    kit.face_patch("Mouth", kit.ellipse_pts(CX, CY, 0.024, 0.031), kit.m_mouth(),
                   lift=lambda t: 0.0016 + 0.0018 * (1 - t * t))
    kit.face_patch("Tongue", kit.ellipse_pts(CX, CY - 0.017, 0.0145, 0.0085, n=20),
                   kit.flat("Tongue", kit.COL["tongue"], rough=0.5),
                   lift=lambda t: 0.0036 + 0.001 * (1 - t * t), rings=3)


def finalize(name):
    return kit.finalize(name, META, mount="head", face=("eyes", "brows", "cheeks"), ao=False,
                        frame=kit.FACE_FRAME)
