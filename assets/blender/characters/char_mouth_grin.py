"""Mouth, grin: a big open D-shaped grin, a row of teeth along the top and a tongue at the
bottom: delighted, celebrating, "it shipped!". `Mouth` + `Teeth` + `Tongue`. Pivot at the
head centre."""
from characters import _kit as kit

import lib

NAME = "char_mouth_grin"
CX, CY = 0.0, -0.08
META = dict(
    name="Mouth: grin", category="character-face", priority="P0",
    description="Big open D-shaped grin with teeth and tongue (delighted)",
    tags=["face", "mouth", "expression", "happy"], tintable=[],
    anchors_bl={"mouth": tuple(kit.face_point(CX, CY - 0.012))},
)


def d_shape(x, y):
    # Top edge flattened into a gentle upward curve, bottom a full round belly.
    return (x, y * 0.16 + 0.12 * x * x) if y > 0 else (x, y)


def build():
    lib.begin(NAME)
    kit.face_patch("Mouth", kit.ellipse_pts(CX, CY, 0.05, 0.036, n=36, squash=d_shape),
                   kit.m_mouth(), lift=lambda t: 0.0016 + 0.0016 * (1 - t * t), rings=6)
    kit.face_patch("Teeth", kit.ellipse_pts(CX, CY + 0.001, 0.04, 0.0085, n=28,
                                           squash=lambda x, y: (x, y * 0.5 if y > 0 else y)),
                   kit.flat("Teeth", "#FFFDF7", rough=0.4),
                   lift=lambda t: 0.0036 + 0.0008 * (1 - t * t), rings=3)
    kit.face_patch("Tongue", kit.ellipse_pts(CX, CY - 0.024, 0.022, 0.0105, n=24),
                   kit.flat("Tongue", kit.COL["tongue"], rough=0.5),
                   lift=lambda t: 0.0036 + 0.0012 * (1 - t * t), rings=3)


def finalize(name):
    return kit.finalize(name, META, mount="head", face=("eyes", "brows", "cheeks"), ao=False,
                        frame=kit.FACE_FRAME)
