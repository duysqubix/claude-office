"""Sneaker: a big chunky toy sneaker (0.19 × 0.14 × 0.27): puffy `Shoes` upper with a round
toe box, a white rubber sole and toe cap, three fat laces and a side stripe (`Accent`).
Pivot at the ankle (end of the shin); its sole touches the floor in the rest pose
(rig foot.below / foot.forward). The rig turns the toes out."""
from characters import _body as B
from characters import _kit as kit

import lib

NAME = "char_shoe_sneaker"
META = dict(
    name="Sneaker", category="character-body", priority="P0",
    description="Chunky toy sneaker with a white sole, laces and a side stripe; pivot at the ankle",
    tags=["body", "shoe", "sneaker"], tintable=["Shoes", "Accent"],
    anchors_bl={"sole": (0, -B.L["foot"]["forward"],
                         -B.L["foot"]["below"] - B.L["foot"]["size"][1] / 2)},
)


def build():
    lib.begin(NAME)
    B.sneaker(B.materials(shoes="#E63946", accent="#FFC93C"))


def finalize(name):
    return kit.finalize(name, META, ao_distance=0.06, lift=(0, 0, B.L["foot"]["below"] +
                                                                B.L["foot"]["size"][1] / 2))
