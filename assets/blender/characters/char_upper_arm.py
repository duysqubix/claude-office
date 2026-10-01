"""Upper arm: shoulder to elbow, a soft capsule (r 0.072, 0.15 long) in a short `Shirt`
sleeve with a rolled hem, bare `Skin` below it (tint that the shirt colour for long
sleeves). Pivot at the shoulder; it hangs down -Y (three.js)."""
from characters import _body as B
from characters import _kit as kit

import lib

NAME = "char_upper_arm"
META = dict(
    name="Upper arm", category="character-body", priority="P0",
    description="Shoulder-to-elbow capsule with a short sleeve; pivot at the shoulder",
    tags=["body", "arm", "sleeve"], tintable=["Shirt", "Skin"],
    anchors_bl={"elbow": (0, 0, -B.L["upperArm"]["len"])},
)


def build():
    lib.begin(NAME)
    B.upper_arm(B.materials(shirt="#4D96FF"))


def finalize(name):
    return kit.finalize(name, META, ao=False)
