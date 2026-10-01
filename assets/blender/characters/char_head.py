"""Head: a soft egg of a sphere (r = headR 0.27; the jaw a touch fuller, the face band on the
true sphere so rig.ts features still sit right), `Skin`, with two translucent blush cheeks
(`Cheek`, alpha-blended). No ears or nose: Wobbly-style. Pivot at the head centre."""
from characters import _kit as kit

import lib

NAME = "char_head"
META = dict(
    name="Head", category="character-body", priority="P0",
    description="Big round soft-egg head with blush cheeks; pivot at the head centre",
    tags=["body", "head", "face"], tintable=["Skin"],
    anchors_bl={
        "headTop": (0, 0, kit.R), "eyes": (0, -kit.R, kit.EYE_Y),
        "hatBand": (0, 0, kit.R * 0.55), "neck": (0, 0, -kit.DIM["headUp"]),
    },
)


def build():
    lib.begin(NAME)
    kit.head_mesh("Head", kit.m_skin(), cuts=11)
    kit.cheeks("Head", kit.m_cheek())


def finalize(name):
    # Shown on the bust with a face so the catalog card reads as a head, not a ball.
    return kit.finalize(name, META, mount="head", face=("eyes", "brows", "mouth"), mq_head=False,
                        ao=False)
