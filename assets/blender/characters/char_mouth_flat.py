"""Mouth, flat: a short, nearly straight line: unimpressed, focused, or sleepy. `Mouth`.
Pivot at the head centre."""
from characters import _kit as kit

import lib

NAME = "char_mouth_flat"
META = dict(
    name="Mouth: flat", category="character-face", priority="P0",
    description="Short flat line (neutral / focused / meh)",
    tags=["face", "mouth", "expression", "neutral"], tintable=[],
    anchors_bl={"mouth": tuple(kit.face_point(0, kit.FACE["mouth"]["y"]))},
)


def build():
    lib.begin(NAME)
    kit.smile("Mouth", kit.m_mouth(), width=0.03, depth=0.003, thick=0.0078)


def finalize(name):
    return kit.finalize(name, META, mount="head", face=("eyes", "brows", "cheeks"), ao=False,
                        frame=kit.FACE_FRAME)
