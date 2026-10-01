"""Mouth, smile: the little closed smile, a soft curve thicker in the middle with round
ends, lying on the face. `Mouth`. Pivot at the head centre (parent to the head, zero
offset); swap between the mouth GLBs for expressions."""
from characters import _kit as kit

import lib

NAME = "char_mouth_smile"
META = dict(
    name="Mouth: smile", category="character-face", priority="P0",
    description="Small closed smile (default expression)",
    tags=["face", "mouth", "expression", "happy"], tintable=[],
    anchors_bl={"mouth": tuple(kit.face_point(0, kit.FACE["mouth"]["y"]))},
)


def build():
    lib.begin(NAME)
    kit.smile("Mouth", kit.m_mouth(), depth=0.027, thick=0.0078)


def finalize(name):
    return kit.finalize(name, META, mount="head", face=("eyes", "brows", "cheeks"), ao=False,
                        frame=kit.FACE_FRAME)
