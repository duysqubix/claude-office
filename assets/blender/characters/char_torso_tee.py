"""Torso, tee: the rig's bean torso in a t-shirt (`Shirt`) tucked into pants (`Pants`, 1.1 cm
proud below the belt, with a soft waistband), a rolled crew neckline where the head sits,
and a little round print on the left chest (`Accent`). Pivot at the pelvis joint. The
upper shirt is node `Chest` (pivot at the chest joint, chestPivotY) so the spine can bend;
the lower part ends in a hidden dome so no hole ever opens."""
from characters import _body as B
from characters import _kit as kit

import lib

NAME = "char_torso_tee"
META = dict(
    name="Torso: t-shirt", category="character-body", priority="P0",
    description="Bean torso in a tucked tee with a crew neck and a chest print; node Chest",
    tags=["body", "torso", "tee", "shirt"], tintable=["Shirt", "Pants", "Accent"],
    anchors_bl={"chestJoint": (0, 0, B.CHEST_Y), "neck": (0, 0, kit.DIM["neckY"]),
                "chestBadge": tuple(kit.bl(*kit.ATTACH.get("chestBadge", {}).get(
                    "at", [0, 0.085, 0.216])))},
    nodes={"Chest": "bends at the chest joint; parent arms, neck and badge to it"},
)


def build():
    lib.begin(NAME)
    M = B.materials(shirt="#4D96FF", accent="#FFC93C")
    B.torso(M)
    lib.node(B.crew_collar(M), "Chest", pivot=(0, 0, B.CHEST_Y))


def finalize(name):
    return kit.finalize(name, META, mount="torso", mq_torso=False, ao=False)
