"""Eyes: a pair of big glossy navy ellipsoids, each with a big catchlight up-and-out and a
small one low-and-in (`EyeShine`, emissive white). Separate nodes `EyeL` / `EyeR` with
their origin at each eye's centre, so the game blinks them with scale.y. The GLB root is the
head centre: parent it to the head with zero offset."""
from characters import _kit as kit

import lib

NAME = "char_eye"
META = dict(
    name="Eyes", category="character-face", priority="P0",
    description="Big glossy eyes with catchlights; nodes EyeL/EyeR pivot at each eye "
                "(blink = scale.y); root at the head centre",
    tags=["face", "eyes"], tintable=[],
    anchors_bl={"eyeL": tuple(kit.on_head(kit.EYE_X, kit.EYE_Y, -0.011)[0]),
                "eyeR": tuple(kit.on_head(-kit.EYE_X, kit.EYE_Y, -0.011)[0])},
    nodes={"EyeL": "blink: scale.y", "EyeR": "blink: scale.y"},
)


def build():
    lib.begin(NAME)
    M = dict(eye=kit.m_eye(), shine=kit.m_shine())
    for side, node in ((1, "EyeL"), (-1, "EyeR")):
        parts, centre = kit.eye(node, side, M)
        for p in parts:
            lib.node(p, node, pivot=centre)


def finalize(name):
    return kit.finalize(name, META, mount="head", face=("brows", "mouth", "cheeks"), ao=False,
                        frame=kit.FACE_FRAME)
